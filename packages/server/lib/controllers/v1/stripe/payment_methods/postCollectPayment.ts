import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { updatePlan } from '@nangohq/shared';
import { report, requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { getStripe } from '../../../../utils/stripe.js';

import type { PostStripeCollectPayment } from '@nangohq/types';

/**
 * We are getting a temp token to allow payment collection
 * It's also the opportunity for us to link a future subscription to an account by specifying the metadata.accountUuid.
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

    const stripe = getStripe();

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
