import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { DBPlan, GetUpcomingInvoice } from '@nangohq/types';

// An allowlist, deliberately inverted from NON_PAYING_PLANS in getOverdueInvoices: a plan added to
// DBPlan['name'] should default to *not* reporting spend. A missing figure is a gap; a wrong one is
// a support ticket.
//
// The reason is specific to this field. Orb's upcoming invoice states the whole invoice, which on a
// long-term or annual contract is the contract total, not a month's charge — one enterprise account
// audited in Aug 2026 had a $30,000 upcoming invoice. So only plans we've confirmed bill on a
// monthly cycle belong here.
// Exhaustive over `DBPlan['name']`, mirroring the webapp's planVisibility maps: a plan added to
// the type fails to compile here until it's been classified, so it can't inherit a figure by
// default on either side.
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

    if (!SPEND_PLANS[plan.name]) {
        res.status(200).send({ data: NO_SPEND });
        return;
    }

    // No customer backfill here, unlike getBillingUsage: the upcoming invoice is keyed by
    // subscription, so there is no customer-keyed call to prepare for. A spend plan with no
    // subscription is a real data inconsistency rather than a state to paper over.
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
