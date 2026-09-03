import { billing, getStripe } from '@nangohq/billing';
import db from '@nangohq/database';
import { canHaveGrowthAddon, getPlanDefinition, handlePlanChanged, productTracking, setGrowthAddon } from '@nangohq/shared';
import { Err, getLogger, Ok, report } from '@nangohq/utils';

import { clearSpendAlertOnPlanChange } from './spendAlertNotification.service.js';

import type { BillingSubscription, DBPlan, DBTeam, PlanDefinition, Result } from '@nangohq/types';
import type Stripe from 'stripe';

const logger = getLogger('Server.PlanChange');

export interface PlanUpgradeResult {
    paymentIntent?: Stripe.PaymentIntent | undefined;
}

export interface PlanChangeContext {
    team: DBTeam;
    currentPlan: DBPlan;
    currentPlanDefinition: PlanDefinition;
    subscriptionId: string;
    requested: {
        /** Orb external plan id. */
        newPlanCode: string;
        /** Whether growth features should be enabled. */
        withGrowthFeatures: boolean;
    };
}

export type PlanDirection = 'upgrade' | 'downgrade';
export type AddonDirection = 'enable' | 'disable';

export interface PlanChangePlan {
    plan: PlanDirection | null;
    addon: AddonDirection | null;
}

export type PlanChangeErrorCode =
    | 'invalid_plan'
    | 'no_subscription'
    | 'plan_not_changeable'
    | 'out_of_sync'
    | 'transition_not_allowed'
    | 'no_change_requested'
    | 'growth_features_unavailable'
    | 'not_linked_to_stripe'
    | 'already_scheduled'
    | 'upgrade_failed'
    | 'downgrade_failed'
    | 'addon_failed';

export class PlanChangeError extends Error {
    constructor(
        public readonly code: PlanChangeErrorCode,
        options?: { cause?: unknown }
    ) {
        super(code, options);
    }
}

export function getPlanChangeContext(
    team: DBTeam,
    currentPlan: DBPlan | null,
    newPlanCode: string,
    withGrowthFeatures: boolean
): Result<PlanChangeContext, PlanChangeError> {
    const definition = currentPlan ? getPlanDefinition(currentPlan.name) : null;
    if (!currentPlan || !definition) {
        return Err(new PlanChangeError('invalid_plan'));
    }
    if (!currentPlan.orb_subscription_id) {
        return Err(new PlanChangeError('no_subscription'));
    }
    if (!definition.canChange) {
        return Err(new PlanChangeError('plan_not_changeable'));
    }

    return Ok({
        team,
        currentPlan: currentPlan,
        currentPlanDefinition: definition,
        subscriptionId: currentPlan.orb_subscription_id,
        requested: {
            newPlanCode: newPlanCode,
            withGrowthFeatures
        }
    });
}

export function resolvePlanChange(context: PlanChangeContext, subscription: BillingSubscription): Result<PlanChangePlan, PlanChangeError> {
    const { currentPlan, currentPlanDefinition, subscriptionId, requested } = context;

    // Our record is a mirror of Orb's, so if it drifts, fail loudly rather than attempting the change
    if (
        subscription.id !== subscriptionId ||
        subscription.planExternalId !== currentPlan.name ||
        subscription.hasGrowthFeatures !== currentPlan.has_growth_features
    ) {
        return Err(new PlanChangeError('out_of_sync'));
    }

    if (requested.withGrowthFeatures && !canHaveGrowthAddon(requested.newPlanCode as DBPlan['name'])) {
        return Err(new PlanChangeError('growth_features_unavailable'));
    }

    let plan: PlanDirection | null = null;
    if (requested.newPlanCode !== currentPlanDefinition.code) {
        if (currentPlanDefinition.nextPlan?.includes(requested.newPlanCode)) {
            plan = 'upgrade';
        } else if (currentPlanDefinition.prevPlan?.includes(requested.newPlanCode)) {
            plan = 'downgrade';
        } else {
            return Err(new PlanChangeError('transition_not_allowed'));
        }
    }

    const addon: AddonDirection | null =
        requested.withGrowthFeatures === currentPlan.has_growth_features ? null : requested.withGrowthFeatures ? 'enable' : 'disable';

    if (addon === 'disable' && subscription.growthFeaturesEndsAt) {
        return Err(new PlanChangeError('already_scheduled'));
    }

    if (plan === 'downgrade' && requested.newPlanCode === currentPlan.orb_future_plan) {
        return Err(new PlanChangeError('already_scheduled'));
    }

    if (!plan && !addon) {
        return Err(new PlanChangeError('no_change_requested'));
    }

    return Ok({ plan, addon });
}
/**
 * Applies a pending Orb subscription change and persists the resulting plan in the database.
 *
 * @param payment - What Stripe collected up front, recorded against the change so Orb doesn't try to
 * collect it again. Omit it for a plan billed fully in arrears: there is no base fee to charge when
 * the change is applied, only usage invoiced at the end of the period. Omitting it also leaves the
 * change unmarked as paid, so Orb invoices the period itself.
 */
export async function applyPendingPlanChange({
    team,
    pendingChangeId,
    payment
}: {
    team: DBTeam;
    pendingChangeId: string;
    payment?: { externalId: string; amountCollected: string } | undefined;
}): Promise<Result<void>> {
    const resApply = await billing.client.applyPendingChanges({ pendingChangeId, payment });
    if (resApply.isErr()) {
        return Err(new Error('failed_to_apply_pending_change', { cause: resApply.error }));
    }

    const subscription = resApply.value;

    const resChanged = await handlePlanChanged(db.knex, team, {
        newPlanCode: subscription.planExternalId,
        orbSubscriptionId: subscription.id
    });
    if (resChanged.isErr()) {
        return Err(new Error('failed_to_sync_applied_plan_change', { cause: resChanged.error }));
    }

    const planChanged = resChanged.value;

    if (planChanged) {
        logger.info(`Plan updated for account ${team.id} to ${resApply.value.planExternalId}`);
        await clearSpendAlertOnPlanChange({ accountId: team.id, subscriptionId: resApply.value.id });
    }

    return Ok(undefined);
}

/**
 * Schedules an upgrade in Orb and settles it, either by collecting the base fee or, when there is
 * nothing payable now, by applying the change immediately.
 */
export async function upgradePlan(context: PlanChangeContext): Promise<Result<PlanUpgradeResult, PlanChangeError>> {
    const { team, currentPlan, subscriptionId, requested } = context;
    if (!currentPlan.stripe_payment_id || !currentPlan.stripe_customer_id) {
        return Err(new PlanChangeError('not_linked_to_stripe'));
    }

    try {
        logger.info(`Upgrading ${team.id} to ${requested.newPlanCode}`);

        // NOTE: we always schedule the upgrade as a pending change.
        // Whether we'll settle the change synchronously or asynchronously (via webhook) depends on whether we need to charge the
        // customer first (up front vs in-arrears). When charging the customer up front, we rely on Stripe and thus must await
        // the payment confirmation via webhook.
        const resUpgrade = await billing.upgrade({ subscriptionId, planExternalId: requested.newPlanCode });
        if (resUpgrade.isErr()) {
            report(resUpgrade.error);
            return Err(new PlanChangeError('upgrade_failed', { cause: resUpgrade.error }));
        }
        const pendingChangeId = resUpgrade.value.pendingChangeId;

        if (!resUpgrade.value.amountInCents) {
            // Orb reported no pending payments found, so apply the pending change inline rather than
            // asynchronously (via Stripe's webhook).
            logger.info(`Nothing to collect upfront, applying ${pendingChangeId} for ${team.id}`);

            const applied = await applyPendingPlanChange({ team, pendingChangeId });
            if (applied.isErr()) {
                report(applied.error);
                return Err(new PlanChangeError('upgrade_failed', { cause: applied.error }));
            }

            return Ok({});
        }

        const stripe = getStripe();

        logger.info(`Asking for base fee ${resUpgrade.value.amountInCents} for ${team.id}`);

        // Create a payment intent to confirm the card
        const paymentIntent = await stripe.paymentIntents.create({
            metadata: { accountUuid: team.uuid },
            amount: Math.round(resUpgrade.value.amountInCents),
            currency: 'usd',
            customer: currentPlan.stripe_customer_id,
            payment_method: currentPlan.stripe_payment_id
        });

        return Ok(paymentIntent.status === 'succeeded' ? {} : { paymentIntent });
    } catch (err) {
        report(err);
        return Err(new PlanChangeError('upgrade_failed', { cause: err }));
    }
}

/** Schedules a downgrade in Orb, which takes effect at the end of the current term. */
export async function downgradePlan(context: PlanChangeContext): Promise<Result<void, PlanChangeError>> {
    const { team, currentPlan, subscriptionId, requested } = context;

    if (requested.newPlanCode !== 'free' && (!currentPlan.stripe_payment_id || !currentPlan.stripe_customer_id)) {
        return Err(new PlanChangeError('not_linked_to_stripe'));
    }

    logger.info(`Downgrading ${team.id} to ${requested.newPlanCode}`);

    const resDowngrade = await billing.downgrade({ subscriptionId, planExternalId: requested.newPlanCode });
    if (resDowngrade.isErr()) {
        report(resDowngrade.error);
        return Err(new PlanChangeError('downgrade_failed', { cause: resDowngrade.error }));
    }

    return Ok(undefined);
}

export function trackPlanChange(context: PlanChangeContext, change: PlanChangePlan): void {
    const { team, currentPlan, requested } = context;

    if (change.plan !== 'downgrade' && change.addon !== 'disable') {
        return;
    }

    productTracking.track({
        name: 'account:billing:downgraded',
        team,
        eventProperties: {
            previousPlan: currentPlan.name,
            newPlan: requested.newPlanCode,
            previousGrowthFeatures: currentPlan.has_growth_features,
            newGrowthFeatures: requested.withGrowthFeatures,
            orbCustomerId: currentPlan.orb_customer_id
        }
    });
}

export async function enableGrowthAddon(context: PlanChangeContext): Promise<Result<void, PlanChangeError>> {
    const { team, subscriptionId } = context;

    logger.info(`Enabling growth add-on for ${team.id}`);

    const resStart = await billing.startGrowthAddon({ subscriptionId });
    if (resStart.isErr()) {
        report(resStart.error);
        return Err(new PlanChangeError('addon_failed', { cause: resStart.error }));
    }

    const resRecord = await setGrowthAddon(db.knex, team, { hasGrowthFeatures: true });
    if (resRecord.isErr()) {
        report(resRecord.error);
        return Err(new PlanChangeError('addon_failed', { cause: resRecord.error }));
    }

    return Ok(undefined);
}

export async function disableGrowthAddon(context: PlanChangeContext, subscription: BillingSubscription): Promise<Result<void, PlanChangeError>> {
    const { team, subscriptionId } = context;

    logger.info(`Disabling growth add-on for ${team.id}`);

    if (!subscription.growthFeaturesPriceIntervalId) {
        return Err(new PlanChangeError('addon_failed', { cause: `Growth add-on price interval not found in subscription: ${subscriptionId}` }));
    }

    const resEnd = await billing.endGrowthAddon({ subscriptionId, priceIntervalId: subscription.growthFeaturesPriceIntervalId });
    if (resEnd.isErr()) {
        report(resEnd.error);
        return Err(new PlanChangeError('addon_failed', { cause: resEnd.error }));
    }

    const resRecord = await setGrowthAddon(db.knex, team, { hasGrowthFeatures: true, endsAt: resEnd.value.growthFeaturesEndsAt });
    if (resRecord.isErr()) {
        report(resRecord.error);
        return Err(new PlanChangeError('addon_failed', { cause: resRecord.error }));
    }

    return Ok(undefined);
}
