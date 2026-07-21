import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { linkBillingCustomer } from '../../../../utils/billing.js';

import type { DBPlan, GetOverdueInvoices } from '@nangohq/types';

// Plans that are never invoiced — they carry no invoices, so we skip the Orb
// call entirely. Free is also by far the largest plan and this endpoint backs
// the always-rendered sidebar card, so avoiding the call matters.
const NON_PAYING_PLANS: DBPlan['name'][] = ['free', 'free-uncapped'];

export const getOverdueInvoices = asyncWrapper<GetOverdueInvoices>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account, user, plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    if (NON_PAYING_PLANS.includes(plan.name)) {
        res.status(200).send({ data: { hasOverdue: false, count: 0, portalUrl: null } });
        return;
    }

    // Backfill the Orb customer if it was never linked (mirrors getBillingUsage).
    if (!plan.orb_customer_id) {
        const linkRes = await linkBillingCustomer(account, user);
        if (linkRes.isErr()) {
            report(linkRes.error);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to link billing customer' } });
            return;
        }
    }

    const overdueRes = await billing.getOverdueInvoices(account.id);
    if (overdueRes.isErr()) {
        report(overdueRes.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get overdue invoices' } });
        return;
    }

    // Only fetch the customer for the portal CTA when there's actually something
    // overdue — the common (no overdue) case skips the extra Orb call.
    let portalUrl: string | null = null;
    if (overdueRes.value.hasOverdue) {
        const customerRes = await billing.getCustomer(account.id);
        if (customerRes.isErr()) {
            report(customerRes.error);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to get customer' } });
            return;
        }
        portalUrl = customerRes.value.portalUrl;
    }

    res.status(200).send({
        data: {
            hasOverdue: overdueRes.value.hasOverdue,
            count: overdueRes.value.count,
            portalUrl
        }
    });
});
