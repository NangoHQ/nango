import Stripe from 'stripe';

import db from '@nangohq/database';
import { accountService, getPlan, getPlansBy, updatePlan } from '@nangohq/shared';
import { getLogger, report } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { plansList } from '../../../utils/plans.js';

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
        apiVersion: '2025-03-31.basil',
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

    /**
     * Please note the field `Metadata` is not persisted on every webhook
     * It should not be a reliable source of data.
     */
    switch (event.type) {
        // case 'checkout.session.completed': {
        //     await db.knex.transaction(async (trx) => {
        //         const data = event.data.object;
        //         // A customer completed their first checkout
        //         // We need to register the customerId and subscriptionId
        //         if (!data.metadata || !data.metadata['accountId']) {
        //             res.status(403).send({ error: { code: 'forbidden', message: 'no accountId in metadata' } });
        //             return;
        //         }

        //         const accountId = parseInt(data.metadata['accountId'], 10);
        //         // TODO: support transaction
        //         const account = await accountService.getAccountById(accountId);
        //         if (!account) {
        //             res.status(403).send({ error: { code: 'forbidden', message: 'no account' } });
        //             return;
        //         }

        //         const planRes = await getPlan(trx, { accountId: account.id });
        //         if (planRes.isErr()) {
        //             res.status(403).send({ error: { code: 'forbidden', message: 'no plan' } });
        //             return;
        //         }

        //         const plan = planRes.value;

        //         await updatePlan(trx, { id: plan.id, stripe_customer_id: data.customer as string, stripe_subscription_id: data.subscription as string });
        //         await stripe.subscriptions.update(data.subscription as string, {
        //             metadata: data.metadata
        //         });
        //         res.status(200).send({ success: true });
        //     });

        //     break;
        // }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
            // A customer completed their first checkout
            // We need to register the customerId and subscriptionId
            await db.knex.transaction(async (trx) => {
                const data = event.data.object;
                console.dir(data, { depth: 10, colors: true });
                // A customer completed their first checkout
                // We need to register the customerId and subscriptionId
                if (!data.metadata || !data.metadata['accountUuid']) {
                    report(new Error('no account uuid'));
                    res.status(400).send({ error: { code: 'invalid_body', message: 'no accountUuid in metadata' } });
                    return;
                }

                // TODO: support transaction
                const account = await accountService.getAccountByUUID(data.metadata['accountUuid']);
                if (!account) {
                    report(new Error('no account'));
                    res.status(400).send({ error: { code: 'invalid_body', message: 'no account' } });
                    return;
                }

                const planRes = await getPlan(trx, { accountId: account.id });
                if (planRes.isErr()) {
                    res.status(400).send({ error: { code: 'invalid_body', message: 'no plan' } });
                    return;
                }

                const plan = planRes.value;

                // TODO: set value from actual plan
                const priceKey = data.items.data[0]!.price.lookup_key;
                if (!priceKey) {
                    report(new Error('no price key'));
                    res.status(400).send({ error: { code: 'invalid_body', message: 'no price key' } });
                    return;
                }

                const planDefinition = plansList.find((p) => p.stripLookupKey === priceKey);
                if (!planDefinition) {
                    report(new Error('no matching plan'));
                    res.status(400).send({ error: { code: 'invalid_body', message: 'no matching plan' } });
                    return;
                }

                const update = await updatePlan(trx, {
                    id: plan.id,
                    trial_end_at: null,
                    trial_start_at: null,
                    trial_expired: null,
                    stripe_customer_id: data.customer as string,
                    stripe_subscription_id: data.id,
                    ...planDefinition.flags
                });
                if (update.isErr()) {
                    report(new Error('failed to update plan'), { stripe_customer_id: data.customer, stripe_subscription_id: data.id });
                    res.status(400).send({ error: { code: 'invalid_body', message: 'no matching plan' } });
                    return;
                }

                res.status(200).send({ success: true });
            });
            break;
        }

        case 'customer.subscription.deleted': {
            // Customer cancelled
            await db.knex.transaction(async (trx) => {
                const data = event.data.object;

                const plansRes = await getPlansBy(trx, { stripe_subscription_id: data.id });
                if (plansRes.isErr()) {
                    res.status(403).send({ error: { code: 'forbidden', message: 'no plans' } });
                    return;
                }

                const freePlan = plansList.find((p) => p.code === 'free')!;
                for (const plan of plansRes.value) {
                    await updatePlan(trx, { id: plan.id, stripe_subscription_id: null, ...freePlan.flags });
                }
                res.status(200).send({ success: true });
            });
            break;
        }

        default:
            res.status(200).send({ success: false });
            break;
    }

    // if (event.type === 'invoice.payment_succeeded') {
    //     const data = event.data.object;

    //     if (data['billing_reason'] == 'subscription_create') {
    //         const subscriptionId = data['subscription'] as string;
    //         const paymentIntentId = data['payment_intent'] as string;
    //         if (!paymentIntentId) {
    //             // Free plan
    //             return;
    //         }
    //         const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    //         await stripe.subscriptions.update(subscriptionId, {
    //             default_payment_method: paymentIntent.payment_method as string
    //         });
    //     }

    //     res.status(200).send({ success: true });
    //     return;
    // }

    // if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    //     // A customer completed their first checkout
    //     // We need to register the customerId and subscriptionId
    //     const data = event.data.object;
    //     const price = data.items.data[0].price;

    //     await prisma.orgs.updateMany({
    //         where: {
    //             stripeCustomerId: data.customer as string
    //         },
    //         data: {
    //             stripeSubscriptionId: data.id,
    //             stripePriceId: price.id,
    //             currentPlanId: price.product as string,
    //             stripeCurrentPeriodStart: new Date(data.current_period_start * 1000),
    //             stripeCurrentPeriodEnd: new Date(data.current_period_end * 1000)
    //         }
    //     });

    //     res.status(200).send({ success: true });
    //     return;
    // }
});
