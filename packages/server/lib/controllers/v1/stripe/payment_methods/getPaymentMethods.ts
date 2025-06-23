import Stripe from 'stripe';

import { requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetStripePaymentMethods } from '@nangohq/types';

/**
 * A session checkout is an URL that redirects to a pre-built UI
 * It's the opportunity for us to link a future subscription to an account by specifying the metadata.accountUuid.
 * Each link is unique and should not reused.
 */
export const getStripePaymentMethods = asyncWrapper<GetStripePaymentMethods>(async (req, res) => {
    if (!envs.STRIPE_SECRET_KEY || !envs.STRIPE_WEBHOOKS_SECRET) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const { plan } = res.locals;
    if (!plan) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const isNotEmpty = requireEmptyBody(req);
    if (isNotEmpty) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(isNotEmpty.error) } });
        return;
    }

    if (!plan.stripe_customer_id) {
        res.status(200).send({ data: [] });
        return;
    }

    const stripe = new Stripe(envs.STRIPE_SECRET_KEY, {
        apiVersion: '2025-05-28.basil',
        typescript: true,
        telemetry: false
    });
    const list = await stripe.paymentMethods.list({ customer: plan.stripe_customer_id });

    res.status(200).send({
        data: list.data.map((p) => {
            return {
                id: p.id,
                last4: p.card!.last4
            };
        })
    });
});
