import Stripe from 'stripe';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { updatePlan } from '@nangohq/shared';
import { report, requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PostStripeCollectPayment } from '@nangohq/types';

/**
 * A session checkout is an URL that redirects to a pre-built UI
 * It's the opportunity for us to link a future subscription to an account by specifying the metadata.accountUuid.
 * Each link is unique and should not reused.
 */
export const postStripeCollectPayment = asyncWrapper<PostStripeCollectPayment>(async (req, res) => {
    if (!envs.STRIPE_SECRET_KEY || !envs.STRIPE_WEBHOOKS_SECRET) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const { account, user, plan } = res.locals;
    if (!plan) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const isNotEmpty = requireEmptyBody(req);
    if (isNotEmpty) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(isNotEmpty.error) } });
        return;
    }

    const stripe = new Stripe(envs.STRIPE_SECRET_KEY, {
        apiVersion: '2025-05-28.basil',
        typescript: true,
        telemetry: false
    });

    // We absolutely need a customer_id but to avoid spamming stripe when users create their account
    // We only do it lazily there
    let stripeCustomerId = plan.stripe_customer_id;
    if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: {
                accountUuid: account.uuid
            }
        });

        const update = await updatePlan(db.knex, { id: plan.id, stripe_customer_id: customer.id });
        if (update.isErr()) {
            report('Failed to update plan', { plan, customer });
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        }

        const link = await billing.linkStripeToCustomer(plan.account_id, customer.id);
        if (link.isErr()) {
            report('Failed to link orb to stripe', { plan, customer });
            res.status(500).send({ error: { code: 'server_error' } });
            return;
        }
        stripeCustomerId = customer.id;
    }

    // Replace Checkout Session with SetupIntent
    const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        usage: 'off_session',
        metadata: { accountUuid: account.uuid }
    });

    res.status(200).send({
        data: {
            secret: setupIntent.client_secret!
        }
    });
});
