import { z } from 'zod';

import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { isSpendPlan } from './spendPlans.js';

import type { PutSpendAlert } from '@nangohq/types';

// One threshold per account, replaced wholesale — Orb holds it as the subscription's single
// `cost_exceeded` alert, and the dashboard offers no way to keep several.
// The ceiling is $10M, well past any real monthly bill: a threshold above the spend it watches is
// inert, and Orb rejects thresholds it can't evaluate, so this catches a slipped decimal point here
// rather than as an opaque Orb error.
const validation = z
    .object({
        thresholdInCents: z.number().int().positive().max(1_000_000_000)
    })
    .strict();

export const putSpendAlert = asyncWrapper<PutSpendAlert>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const { plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    if (!isSpendPlan(plan)) {
        res.status(400).send({ error: { code: 'feature_disabled', message: 'Spend alerts are not available on this plan' } });
        return;
    }

    if (!plan.orb_subscription_id) {
        report(new Error('billing_subscription_not_found', { cause: { accountId: plan.account_id, plan: plan.name } }));
        res.status(500).send({ error: { code: 'server_error', message: 'Billing subscription not found' } });
        return;
    }

    const alertRes = await billing.setSpendAlert(plan.orb_subscription_id, { thresholdInCents: val.data.thresholdInCents });
    if (alertRes.isErr()) {
        report(alertRes.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to save spend alert' } });
        return;
    }

    res.status(200).send({ data: { thresholdInCents: alertRes.value.thresholdInCents, currency: alertRes.value.currency } });
});
