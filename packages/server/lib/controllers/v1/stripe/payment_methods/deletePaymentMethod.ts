import { z } from 'zod';

import db from '@nangohq/database';
import { updatePlan } from '@nangohq/shared';
import { report, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { getStripe } from '../../../../utils/stripe.js';

import type { DeleteStripePayment } from '@nangohq/types';

const schemaQuery = z
    .object({
        env: z.string(),
        payment_id: z.string()
    })
    .strict();
export const deleteStripePaymentMethod = asyncWrapper<DeleteStripePayment>(async (req, res) => {
    if (!envs.STRIPE_SECRET_KEY || !envs.STRIPE_WEBHOOKS_SECRET) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const { plan } = res.locals;
    if (!plan) {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'feature disabled' } });
        return;
    }

    const valQuery = schemaQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const query: DeleteStripePayment['Querystring'] = valQuery.data;

    const stripe = getStripe();
    await stripe.paymentMethods.detach(query.payment_id);

    const updated = await updatePlan(db.knex, { id: plan.id, stripe_payment_id: null });
    if (updated.isErr()) {
        report('Failed to update plan', { plan });
        res.status(500).send({ error: { code: 'server_error', message: 'failed to update plan' } });
        return;
    }

    res.status(200).send({
        data: {
            deleted: true
        }
    });
});
