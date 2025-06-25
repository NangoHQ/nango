import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { getPlanBy, updatePlan } from '@nangohq/shared';
import { getLogger, report } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getStripe } from '../../../utils/stripe.js';

import type { PostStripeWebhooks } from '@nangohq/types';
import type Stripe from 'stripe';

const logger = getLogger('Server.Stripe');

/**
 * Stripe is sending webhook on checkout and subscription created.
 * Without this we can't link a payment to an account in our backend
 *
 * Forward locally with:
 * stripe listen --load-from-webhooks-api --forward-to localhost:3003
 */
export const postStripeWebhooks = asyncWrapper<PostStripeWebhooks>(async (req, res) => {
    if (!envs.STRIPE_SECRET_KEY || !envs.STRIPE_WEBHOOKS_SECRET) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const sig = req.headers['stripe-signature'];
    if (!sig || typeof sig !== 'string') {
        report(new Error('[stripe] No signature'));
        res.status(403).send({ error: { code: 'forbidden', message: 'no signature' } });
        return;
    }

    const stripe = getStripe();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody!, sig, envs.STRIPE_WEBHOOKS_SECRET);
    } catch (err) {
        report(err);
        res.status(403).send({ error: { code: 'forbidden', message: 'signature does not match' } });
        return;
    }

    logger.info('[stripe-hook]', event.type);

    console.log(event);
    switch (event.type) {
        // card was created through our UI
        case 'setup_intent.succeeded': {
            const data = event.data.object;
            if (typeof data.customer !== 'string') {
                report(new Error('strip_webhook_missing_customer'));
                res.status(400).send({ error: { code: 'invalid_body', message: 'missing customer in data' } });
                break;
            }

            const resPlan = await getPlanBy(db.knex, { stripe_customer_id: data.customer });
            if (resPlan.isErr()) {
                report(new Error('strip_webhook_missing_plan'));
                res.status(400).send({ error: { code: 'invalid_body', message: 'missing plan' } });
                break;
            }

            const plan = resPlan.value;
            const updated = await updatePlan(db.knex, { id: plan.id, stripe_payment_id: data.payment_method as string });
            if (updated.isErr()) {
                report('Failed to update plan from stripe', { plan, data });
                res.status(500).send({ error: { code: 'server_error', message: 'failed to update plan' } });
                break;
            }

            res.status(200).send({ success: true });
            break;
        }

        // card was deleted through the UI or via stripe directly
        case 'payment_method.detached': {
            const customer = event.data.previous_attributes?.customer;
            if (typeof customer !== 'string') {
                report(new Error('strip_webhook_missing_customer'));
                res.status(400).send({ error: { code: 'invalid_body', message: 'missing customer in data' } });
                break;
            }

            const resPlan = await getPlanBy(db.knex, { stripe_customer_id: customer });
            if (resPlan.isErr()) {
                report(new Error('strip_webhook_missing_plan'));
                res.status(400).send({ error: { code: 'invalid_body', message: 'missing plan' } });
                break;
            }

            const plan = resPlan.value;
            if (plan.stripe_payment_id && plan.stripe_payment_id === event.data.object.id) {
                // Only delete if it's the same main payment method
                const updated = await updatePlan(db.knex, { id: plan.id, stripe_payment_id: null });
                if (updated.isErr()) {
                    report('Failed to update plan from stripe', { plan });
                    res.status(500).send({ error: { code: 'server_error', message: 'failed to update plan' } });
                    break;
                }
            }

            res.status(200).send({ success: true });
            break;
        }

        // payment intent from upgrade has been successful
        case 'payment_intent.succeeded': {
            const data = event.data.object;
            const customer = data.customer;
            if (typeof customer !== 'string') {
                report(new Error('strip_webhook_missing_customer'));
                res.status(400).send({ error: { code: 'invalid_body', message: 'missing customer in data' } });
                break;
            }

            const resPlan = await getPlanBy(db.knex, { stripe_customer_id: customer });
            if (resPlan.isErr()) {
                report(new Error('strip_webhook_missing_plan'));
                res.status(400).send({ error: { code: 'invalid_body', message: 'missing plan' } });
                break;
            }

            logger.info(`Payment received for account ${resPlan.value.account_id} ${data.amount}$`);

            // We want to continue our plan upgrade
            const sub = (await billing.getSubscription(resPlan.value.account_id)).unwrap();
            if (!sub || !sub.pendingChangeId) {
                res.status(400).send({ error: { code: 'invalid_body', message: "team doesn't not have a subscription or pending changes" } });
                break;
            }

            const resApply = await billing.client.applyPendingChanges({ pendingChangeId: sub.pendingChangeId });
            if (resApply.isErr()) {
                report(resApply.error);
                res.status(500).send({ error: { code: 'server_error', message: 'failed to apply changes' } });
                break;
            }

            res.status(200).send({ success: true });
            break;
        }

        // payment intent from upgrade has not been successful
        case 'payment_intent.canceled':
        case 'payment_intent.payment_failed': {
            // TODO: handle that or die

            res.status(200).send({ success: true });
            break;
        }

        default:
            res.status(200).send({ success: false });
            break;
    }
});
