import * as z from 'zod';

import { billing } from '@nangohq/billing';
import { accountService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { teamToApi } from '../../../formatters/team.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getStripe } from '../../../utils/stripe.js';

import type { PutTeam } from '@nangohq/types';

const validation = z
    .object({
        name: z.string().min(3).max(255)
    })
    .strict();

export const putTeam = asyncWrapper<PutTeam>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { account, plan } = res.locals;
    const body: PutTeam['Body'] = val.data;

    await accountService.editAccount({ id: account.id, ...body });

    if (plan?.stripe_customer_id && plan?.orb_customer_id) {
        const stripe = getStripe();
        try {
            await Promise.all([
                stripe.customers.update(plan.stripe_customer_id, {
                    name: body.name
                }),
                billing.updateCustomer(plan.orb_customer_id, body.name)
            ]);
        } catch (err) {
            report(new Error('Failed to update customer name', { cause: err }), { accountId: account.id });
        }
    }

    res.status(200).send({
        data: teamToApi({
            ...account,
            ...body
        })
    });
});
