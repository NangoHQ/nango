import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { isSpendPlan } from '../../../../utils/spendPlans.js';

import type { GetSpendAlert } from '@nangohq/types';

const NO_ALERT = { thresholdInCents: null, currency: null };

export const getSpendAlert = asyncWrapper<GetSpendAlert>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    if (!isSpendPlan(plan)) {
        res.status(200).send({ data: NO_ALERT });
        return;
    }

    // A spend plan can exist before its Orb subscription is linked; there is no threshold to read,
    // which is not a failure.
    if (!plan.orb_subscription_id) {
        res.status(200).send({ data: NO_ALERT });
        return;
    }

    const alertRes = await billing.getSpendAlert(plan.orb_subscription_id);
    if (alertRes.isErr()) {
        report(alertRes.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get spend alert' } });
        return;
    }

    const alert = alertRes.value;
    if (alert) {
        res.status(200).send({ data: { thresholdInCents: alert.thresholdInCents, currency: alert.currency } });
        return;
    }

    // Every Orb customer is created in USD (see getOrCreateCustomer), so with no alert to read a
    // currency off, USD is what the customer would be setting a threshold in. Revisit this once
    // Nango bills in more than one currency.
    res.status(200).send({ data: { thresholdInCents: null, currency: 'USD' } });
});
