import { z } from 'zod';

import { billing } from '@nangohq/billing';
import { plansList } from '@nangohq/shared';
import { getLogger, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import {
    disableGrowthAddon,
    downgradePlan,
    enableGrowthAddon,
    getPlanChangeContext,
    resolvePlanChange,
    trackPlanChange,
    upgradePlan
} from '../../../../services/planChange.service.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PlanChangeContext, PlanChangeError, PlanChanges } from '../../../../services/planChange.service.js';
import type { RequestLocals } from '../../../../utils/express.js';
import type { BillingSubscription, PostPlanChange } from '@nangohq/types';
import type { Response } from 'express';
import type Stripe from 'stripe';

const logger = getLogger('Server.PostChange');

type PlanChangeResponse = Response<PostPlanChange['Reply'], RequestLocals>;

function logContext(context: PlanChangeContext, subscription: BillingSubscription, changes: PlanChanges) {
    return {
        accountId: context.team.id,
        currentPlan: context.currentPlan.name,
        requestedPlan: context.requested.newPlanCode,
        requestedWithGrowthAddon: context.requested.withGrowthFeatures,
        subscriptionId: context.subscriptionId,
        subscription,
        changes
    };
}

function sendPlanChangeError(res: PlanChangeResponse, error: PlanChangeError): void {
    report(error);
    switch (error.code) {
        case 'not_linked_to_stripe':
            res.status(400).send({ error: { code: 'invalid_body', message: 'team is not linked to stripe' } });
            return;
        case 'already_scheduled':
            res.status(400).send({ error: { code: 'invalid_body', message: 'this change is already scheduled' } });
            return;
        case 'transition_not_allowed':
            res.status(400).send({ error: { code: 'invalid_body', message: 'team cannot change to this plan' } });
            return;
        case 'no_change_requested':
            res.status(400).send({ error: { code: 'invalid_body', message: 'team is already on this plan' } });
            return;
        case 'out_of_sync':
            res.status(409).send({ error: { code: 'conflict', message: 'billing state is being reconciled, please try again shortly' } });
            return;
        case 'invalid_plan':
            res.status(400).send({ error: { code: 'invalid_body', message: 'team has an invalid plan' } });
            return;
        case 'no_subscription':
            res.status(400).send({ error: { code: 'invalid_body', message: 'team does not have a subscription' } });
            return;
        case 'plan_not_changeable':
            res.status(400).send({ error: { code: 'invalid_body', message: 'team cannot change plan' } });
            return;
        case 'growth_features_unavailable':
            res.status(400).send({ error: { code: 'invalid_body', message: 'growth features are not available on this plan' } });
            return;
        case 'upgrade_failed':
        case 'downgrade_failed':
        case 'addon_failed':
            // Already reported with its cause by the service, which has the context to describe it
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        default:
            ((exhaustiveCheck: never) => {
                throw new Error(`Unhandled plan change error code: ${exhaustiveCheck}`);
            })(error.code);
    }
}

const orbIds = plansList.map((p) => p.code).filter(Boolean) as string[];
const validation = z
    .object({
        orbId: z.enum(orbIds as [string, ...string[]]),
        withGrowthFeatures: z.boolean()
    })
    .strict();

export const postPlanChange = asyncWrapper<PostPlanChange>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { account, plan } = res.locals;
    const body: PostPlanChange['Body'] = val.data;

    const resContext = getPlanChangeContext(account, plan, body.orbId, body.withGrowthFeatures);
    if (resContext.isErr()) {
        sendPlanChangeError(res, resContext.error);
        return;
    }
    const context = resContext.value;

    const resSub = await billing.getSubscription(account.id);
    if (resSub.isErr()) {
        report(resSub.error);
        res.status(500).send({ error: { code: 'server_error' } });
        return;
    }
    const subscription = resSub.value;

    const resChange = resolvePlanChange(context, subscription);
    if (resChange.isErr()) {
        sendPlanChangeError(res, resChange.error);
        return;
    }
    const changes = resChange.value;

    if (subscription.pendingChangeId) {
        logger.info('Detected pending plan change, canceling it', logContext(context, subscription, changes));
        // There is a pending change on Orb already; we must cancel it before moving forward with our change
        const cancelled = await billing.client.cancelPendingChanges({ pendingChangeId: subscription.pendingChangeId });
        if (cancelled.isErr()) {
            report(cancelled.error);
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        }
    }

    if (changes.addon === 'disable') {
        logger.info('Disabling growth add-on', logContext(context, subscription, changes));
        const disabled = await disableGrowthAddon(context, subscription);
        if (disabled.isErr()) {
            sendPlanChangeError(res, disabled.error);
            return;
        }
    }

    let paymentIntent: Stripe.PaymentIntent | undefined;
    if (changes.plan === 'upgrade') {
        logger.info('Upgrading plan', logContext(context, subscription, changes));
        const upgraded = await upgradePlan(context);
        if (upgraded.isErr()) {
            sendPlanChangeError(res, upgraded.error);
            return;
        }
        paymentIntent = upgraded.value.paymentIntent;
    } else if (changes.plan === 'downgrade') {
        logger.info('Downgrading plan', logContext(context, subscription, changes));
        const downgraded = await downgradePlan(context);
        if (downgraded.isErr()) {
            sendPlanChangeError(res, downgraded.error);
            return;
        }
    }

    if (changes.addon === 'enable') {
        logger.info('Enabling growth add-on', logContext(context, subscription, changes));
        const enabled = await enableGrowthAddon(context);
        if (enabled.isErr()) {
            sendPlanChangeError(res, enabled.error);
            return;
        }
    }

    trackPlanChange(context, changes);

    res.status(200).send({ data: paymentIntent ? { paymentIntent } : { success: true } });
});
