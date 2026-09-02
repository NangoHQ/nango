import { billing, getStripe } from '@nangohq/billing';
import db from '@nangohq/database';
import { handlePlanChanged, productTracking } from '@nangohq/shared';
import { Err, getLogger, Ok, report } from '@nangohq/utils';

import { clearSpendAlertOnPlanChange } from './spendAlertNotification.service.js';

import type { DBPlan, DBTeam, Result } from '@nangohq/types';
import type Stripe from 'stripe';

const logger = getLogger('Server.PlanChange');

export type PlanChangeErrorCode = 'not_linked_to_stripe' | 'already_scheduled' | 'upgrade_failed' | 'downgrade_failed';

export class PlanChangeError extends Error {
    constructor(
        public readonly code: PlanChangeErrorCode,
        options?: { cause?: unknown }
    ) {
        super(code, options);
    }
}

export interface PlanChangeContext {
    team: DBTeam;
    plan: DBPlan;
    subscriptionId: string;
    /** Orb external plan id. */
    newPlanCode: string;
}

export interface PlanUpgradeResult {
    paymentIntent?: Stripe.PaymentIntent | undefined;
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
export async function upgradePlan({ team, plan, subscriptionId, newPlanCode }: PlanChangeContext): Promise<Result<PlanUpgradeResult, PlanChangeError>> {
    if (!plan.stripe_payment_id || !plan.stripe_customer_id) {
        return Err(new PlanChangeError('not_linked_to_stripe'));
    }

    try {
        logger.info(`Upgrading ${team.id} to ${newPlanCode}`);

        const resUpgrade = await billing.upgrade({ subscriptionId, planExternalId: newPlanCode });
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
            customer: plan.stripe_customer_id,
            payment_method: plan.stripe_payment_id
        });

        return Ok(paymentIntent.status === 'succeeded' ? {} : { paymentIntent });
    } catch (err) {
        report(err);
        return Err(new PlanChangeError('upgrade_failed', { cause: err }));
    }
}

/** Schedules a downgrade in Orb, which takes effect at the end of the current term. */
export async function downgradePlan({ team, plan, subscriptionId, newPlanCode }: PlanChangeContext): Promise<Result<void, PlanChangeError>> {
    if (newPlanCode === plan.orb_future_plan) {
        return Err(new PlanChangeError('already_scheduled'));
    }

    if (newPlanCode !== 'free' && (!plan.stripe_payment_id || !plan.stripe_customer_id)) {
        return Err(new PlanChangeError('not_linked_to_stripe'));
    }

    logger.info(`Downgrading ${team.id} to ${newPlanCode}`);

    const resDowngrade = await billing.downgrade({ subscriptionId, planExternalId: newPlanCode });
    if (resDowngrade.isErr()) {
        report(resDowngrade.error);
        return Err(new PlanChangeError('downgrade_failed', { cause: resDowngrade.error }));
    }

    productTracking.track({
        name: 'account:billing:downgraded',
        team,
        eventProperties: { previousPlan: plan.name, newPlan: newPlanCode, orbCustomerId: plan.orb_customer_id }
    });

    return Ok(undefined);
}
