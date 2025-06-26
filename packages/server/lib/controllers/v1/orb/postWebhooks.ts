import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { accountService, plansList, updatePlanByTeam } from '@nangohq/shared';
import { Err, Ok, getLogger, report } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostOrbWebhooks, Result } from '@nangohq/types';

const logger = getLogger('Server.Orb');

/**
 * Orb is sending webhooks when subscription changes or else
 *
 * Forward locally with:
 * lt --port 3003
 */
export const postOrbWebhooks = asyncWrapper<PostOrbWebhooks>(async (req, res) => {
    if (!envs.ORB_API_KEY || !envs.ORB_WEBHOOKS_SECRET) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const verified = billing.verifyWebhookSignature(req.rawBody || '', req.headers, envs.ORB_WEBHOOKS_SECRET);
    if (verified.isErr()) {
        res.status(400).send({ error: { code: 'invalid_headers', message: 'invalid signature' } });
        return;
    }

    const handled = await handleWebhook(req.body as Webhooks);
    if (handled.isErr()) {
        report(handled.error, { body: req.body });
        res.status(500).send({ error: { code: 'server_error', message: handled.error.message } });
        return;
    }

    res.status(200).send({ success: true });
});

interface BaseWebhookEvent {
    id: string;
    created_at: string;
    type: string;
}

interface SubscriptionEvent extends BaseWebhookEvent {
    subscription: {
        id: string;
        customer: { id: string; external_customer_id: string };
        plan: { id: string; external_plan_id: string };
    };
}

interface SubscriptionCreatedEvent extends SubscriptionEvent {
    type: 'subscription.created';
}

interface SubscriptionStartedEvent extends SubscriptionEvent {
    type: 'subscription.started';
}

interface SubscriptionPlanChangedEvent extends SubscriptionEvent {
    type: 'subscription.plan_changed';
}

interface SubscriptionPlanChangedScheduledEvent extends SubscriptionEvent {
    type: 'subscription.plan_change_scheduled';
    properties: {
        change_date: string;
        new_plan_id: string;
        previous_plan_id: string;
    };
}

type Webhooks = SubscriptionCreatedEvent | SubscriptionStartedEvent | SubscriptionPlanChangedEvent | SubscriptionPlanChangedScheduledEvent;

async function handleWebhook(body: Webhooks): Promise<Result<void>> {
    logger.info('Received', body.type);

    switch (body.type) {
        case 'subscription.started':
        case 'subscription.plan_changed': {
            return await db.knex.transaction(async (trx) => {
                const planExternalId = body.subscription.plan.external_plan_id;
                const exists = plansList.find((p) => p.orbId === planExternalId);
                if (!exists) {
                    return Err('Received a plan not linked to the plansList');
                }

                const teamId = body.subscription.customer.external_customer_id;
                if (!teamId) {
                    return Err('Received a customer without external id');
                }

                const team = await accountService.getAccountById(trx, parseInt(teamId, 10));
                if (!team) {
                    return Err('Failed to find team');
                }

                logger.info(`Sub started for team "${team.id}"`);

                const updated = await updatePlanByTeam(trx, {
                    account_id: team.id,
                    name: planExternalId,
                    trial_start_at: null,
                    trial_end_at: null,
                    trial_end_notified_at: null,
                    trial_extension_count: 0,
                    trial_expired: null,
                    orb_subscription_id: body.subscription.id,
                    orb_future_plan: null,
                    orb_future_plan_at: null,
                    ...exists.flags
                });
                if (updated.isErr()) {
                    return Err('Failed to updated plan');
                }

                return Ok(undefined);
            });
        }

        case 'subscription.plan_change_scheduled': {
            return await db.knex.transaction(async (trx) => {
                const planId = body.properties.new_plan_id;
                if (!planId) {
                    return Err('Received an empty future plan');
                }

                const resNewPlan = await billing.getPlanById(planId);
                if (resNewPlan.isErr()) {
                    return Err(resNewPlan.error);
                }

                const teamId = body.subscription.customer.external_customer_id;
                if (!teamId) {
                    return Err('Received a customer without external id');
                }

                const team = await accountService.getAccountById(trx, parseInt(teamId, 10));
                if (!team) {
                    return Err('Failed to find team');
                }

                logger.info(`Sub scheduled for team "${team.id}"`);
                const updated = await updatePlanByTeam(trx, {
                    account_id: team.id,
                    orb_future_plan: resNewPlan.value.external_plan_id,
                    orb_future_plan_at: new Date(body.properties.change_date)
                });
                if (updated.isErr()) {
                    return Err('Failed to updated plan');
                }

                return Ok(undefined);
            });
        }

        default:
            return Ok(undefined);
    }
}
