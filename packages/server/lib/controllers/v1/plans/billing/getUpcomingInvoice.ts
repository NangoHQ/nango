import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { DBPlan, GetUpcomingInvoice } from '@nangohq/types';

// Monthly-billed plans only. `amount_due` is the whole upcoming invoice, so on an annual contract
// it states the contract total rather than this period's charge — $30,000 on one enterprise account.
// Exhaustive, so a new plan has to be classified rather than inheriting a figure.
const SPEND_PLANS: Record<DBPlan['name'], boolean> = {
    'starter-v2': true,
    'growth-v2': true,
    'startup-deal': true,
    free: false,
    'free-uncapped': false,
    enterprise: false,
    'enterprise-cloud-hosted': false,
    starter: false,
    growth: false,
    'starter-legacy': false,
    'scale-legacy': false,
    'growth-legacy': false
};

const NO_SPEND = { amountInCents: null, currency: null };

export const getUpcomingInvoice = asyncWrapper<GetUpcomingInvoice>(async (req, res) => {
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

    if (SPEND_PLANS[plan.name] !== true) {
        res.status(200).send({ data: NO_SPEND });
        return;
    }

    if (!plan.orb_subscription_id) {
        report(new Error('billing_subscription_not_found', { cause: { accountId: plan.account_id, plan: plan.name } }));
        res.status(500).send({ error: { code: 'server_error', message: 'Billing subscription not found' } });
        return;
    }

    const invoiceRes = await billing.getUpcomingInvoice(plan.orb_subscription_id);
    if (invoiceRes.isErr()) {
        report(invoiceRes.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get upcoming invoice' } });
        return;
    }

    const invoice = invoiceRes.value;
    res.status(200).send({ data: invoice ? { amountInCents: invoice.amountInCents, currency: invoice.currency } : NO_SPEND });
});
