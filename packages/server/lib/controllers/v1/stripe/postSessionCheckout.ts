import Stripe from 'stripe';
import { z } from 'zod';

import { basePublicUrl, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { plansList } from '../../../utils/plans.js';

import type { PostStripeSessionCheckout } from '@nangohq/types';

const validation = z
    .object({
        priceKey: z.string().min(1).max(256)
    })
    .strict();

/**
 * A session checkout is an URL that contains what the customer is buying
 * It's the opportunity for us to link a future subscription to an account by specifying the metadata.accountUuid.
 * Each link is unique and should not reused.
 */
export const postStripeSessionCheckout = asyncWrapper<PostStripeSessionCheckout>(async (req, res) => {
    if (!envs.STRIPE_SECRET_KEY || !envs.STRIPE_WEBHOOKS_SECRET) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const body: PostStripeSessionCheckout['Body'] = val.data;
    if (!plansList.some((p) => p.stripLookupKey === body.priceKey && !p.hidden && p.canUpgrade)) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'invalid price key' } });
        return;
    }

    const { account, user, plan } = res.locals;
    if (!plan) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const billingUrl = `${basePublicUrl}/prod/team/billing`;

    const stripe = new Stripe(envs.STRIPE_SECRET_KEY, {
        apiVersion: '2025-03-31.basil',
        typescript: true,
        telemetry: false
    });

    // Get the actual price_id
    const prices = await stripe.prices.list({
        lookup_keys: [body.priceKey],
        expand: ['data.product']
    });
    if (prices.data.length !== 1 || !prices.data[0]) {
        res.status(400).send({ error: { code: 'invalid_body', message: "The given priceKey wasn't found" } });
        return;
    }

    // TODO: remember why I did that
    // if (plan.stripe_customer_id && plan.stripe_subscription_id) {
    //     const sub = await stripe.subscriptions.retrieve(plan.stripe_subscription_id);

    //     if (sub.default_payment_method && sub.items.data.length > 0 && prices.data[0]) {
    //         // Already have paying customer
    //         await stripe.subscriptions.update(plan.stripe_subscription_id, {
    //             cancel_at_period_end: false,
    //             items: [{ id: sub.items.data[0].id, price: prices.data[0]!.id }]
    //         });

    //         return res.status(200).send({ data: { url: billingUrl } });
    //     }
    // }

    let stripeCustomerId = plan.stripe_customer_id;
    if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: {
                accountUuid: account.uuid
            }
        });

        stripeCustomerId = customer.id;
    }

    const options: Stripe.Checkout.SessionCreateParams = {
        success_url: `${billingUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: billingUrl,
        mode: 'subscription',
        billing_address_collection: 'auto',
        line_items: [
            {
                price: prices.data[0].id,
                quantity: 1
            }
        ],
        client_reference_id: String(account.uuid),
        allow_promotion_codes: true,
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        subscription_data: {
            metadata: {
                accountUuid: account.uuid
            }
        },
        customer: stripeCustomerId,
        customer_update: { name: 'auto', address: 'auto' }
    };
    const stripeSession = await stripe.checkout.sessions.create(options);

    res.status(200).send({
        data: {
            url: stripeSession.url!
        }
    });
});
