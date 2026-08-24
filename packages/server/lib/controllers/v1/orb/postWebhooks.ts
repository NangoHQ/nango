import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { accountService, handlePlanChanged, updatePlanByTeam } from '@nangohq/shared';
import { Err, getLogger, Ok, report } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { clearSpendAlertOnPlanChange, notifySpendAlert } from '../../../services/spendAlertNotification.service.js';
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

interface SubscriptionCostExceededEvent extends SubscriptionEvent {
    type: 'subscription.cost_exceeded';
    properties: {
        timeframe_start: string;
        timeframe_end: string;
        /** The threshold that was crossed, in major units. */
        amount_threshold: number;
    };
}

interface SubscriptionPlanChangedScheduledEvent extends SubscriptionEvent {
    type: 'subscription.plan_change_scheduled';
    properties: {
        change_date: string;
        new_plan_id: string;
        previous_plan_id: string;
    };
}

type Webhooks =
    | SubscriptionCreatedEvent
    | SubscriptionStartedEvent
    | SubscriptionPlanChangedEvent
    | SubscriptionPlanChangedScheduledEvent
    | SubscriptionCostExceededEvent;

async function handleWebhook(body: Webhooks): Promise<Result<void>> {
    logger.info('[orb-hook]', body.type);

    switch (body.type) {
        case 'subscription.started':
        case 'subscription.plan_changed': {
            const teamId = body.subscription.customer.external_customer_id;
            if (!teamId) {
                return Err('Received a customer without external id');
            }

            const team = await accountService.getAccountById(db.knex, parseInt(teamId, 10));
            if (!team) {
                return Err('Failed to find team');
            }

            // handlePlanChanged's own boolean result is returned as-is, rather than reduced to void
            // inside the transaction, because whether to clear the spend alert is decided below.
            const changed = await db.knex.transaction(async (trx) => {
                logger.info(`Sub started for team "${team.id}"`);
                return await handlePlanChanged(trx, team, {
                    newPlanCode: body.subscription.plan.external_plan_id,
                    orbCustomerId: body.subscription.customer.id,
                    orbSubscriptionId: body.subscription.id
                });
            });

            if (changed.isErr()) {
                return Err(changed.error);
            }
            if (changed.value) {
                // Outside the transaction: the plan change is committed, and an Orb call has no
                // business holding a database transaction open.
                await clearSpendAlertOnPlanChange({ accountId: team.id, subscriptionId: body.subscription.id });
            }

            return Ok(undefined);
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

        case 'subscription.cost_exceeded': {
            const teamId = body.subscription.customer.external_customer_id;
            if (!teamId) {
                return Err('Received a customer without external id');
            }

            const team = await accountService.getAccountById(db.knex, parseInt(teamId, 10));
            if (!team) {
                return Err('Failed to find team');
            }

            return await notifySpendAlert({
                team,
                crossing: {
                    thresholdInCents: Math.round(body.properties.amount_threshold * 100),
                    timeframeStart: new Date(body.properties.timeframe_start),
                    timeframeEnd: new Date(body.properties.timeframe_end),
                    subscriptionId: body.subscription.id
                }
            });
        }

        default:
            return Ok(undefined);
    }
}
