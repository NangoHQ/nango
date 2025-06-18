import Stripe from 'stripe';

import db from '@nangohq/database';
import { getPlanBy, updatePlan } from '@nangohq/shared';
import { getLogger, report } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostStripeWebhooks } from '@nangohq/types';

const logger = getLogger('Server.Stripe');

/**
 * Stripe is sending webhook on checkout and subscription created.
 * Without this we can't link a payment to an account in our backend
 *
 * Forward
 * stripe listen --load-from-webhooks-api --forward-to localhost:3003
 */
export const postStripWebhooks = asyncWrapper<PostStripeWebhooks>(async (req, res) => {
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

    const stripe = new Stripe(envs.STRIPE_SECRET_KEY, {
        apiVersion: '2025-05-28.basil',
        typescript: true,
        telemetry: false
    });

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody!, sig, envs.STRIPE_WEBHOOKS_SECRET);
    } catch (err) {
        report(err);
        res.status(403).send({ error: { code: 'forbidden', message: 'signature does not match' } });
        return;
    }

    logger.info('[stripe-hook]', event.type);

    switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
            console.error('not possible', event.type);
            res.status(200).send({ success: false });
            break;
        }

        case 'setup_intent.succeeded': {
            console.log('setup', event);
            const data = event.data.object;
            if (typeof data.customer !== 'string') {
                report(new Error('strip_webhook_missing_customer'));
                res.status(400).send({ error: { code: 'invalid_body', message: 'missing customer in data' } });
                return;
            }

            const resPlan = await getPlanBy(db.knex, { stripe_customer_id: data.customer });
            if (resPlan.isErr()) {
                report(new Error('strip_webhook_missing_plan'));
                res.status(400).send({ error: { code: 'invalid_body', message: 'missing plan' } });
                return;
            }

            await updatePlan(db.knex, { id: resPlan.value.id, stripe_payment_id: event.data.object.payment_method as string });

            res.status(200).send({ success: false });
            break;
        }

        default:
            res.status(200).send({ success: false });
            break;
    }
});
