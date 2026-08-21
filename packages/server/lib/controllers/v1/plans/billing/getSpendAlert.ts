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

    // With no alert there is no currency to read off one, but the dashboard still needs to know
    // which currency the customer would be setting a threshold in. The draft invoice answers that,
    // and Orb serves it from cache, so the extra call only lands on accounts with no alert yet.
    // A failure here isn't worth a 500 — the threshold field is the point, the symbol is a nicety.
    const invoiceRes = await billing.getUpcomingInvoice(plan.orb_subscription_id);
    if (invoiceRes.isErr()) {
        // Degraded rather than fatal — the threshold field is the point, the symbol is a nicety —
        // but still reported, so a billing outage isn't mistaken for a missing currency.
        report(invoiceRes.error);
    }
    res.status(200).send({ data: { thresholdInCents: null, currency: invoiceRes.isOk() ? (invoiceRes.value?.currency ?? null) : null } });
});
