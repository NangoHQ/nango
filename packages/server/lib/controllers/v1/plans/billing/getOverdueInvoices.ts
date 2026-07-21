import { billing } from '@nangohq/billing';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

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
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to link billing customer' } });
            return;
        }
    }

    const [overdueRes, customerRes] = await Promise.all([billing.getOverdueInvoices(account.id), billing.getCustomer(account.id)]);

    if (overdueRes.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get overdue invoices' } });
        return;
    }
    if (customerRes.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get customer' } });
        return;
    }

    res.status(200).send({
        data: {
            hasOverdue: overdueRes.value.hasOverdue,
            count: overdueRes.value.count,
            portalUrl: customerRes.value.portalUrl
        }
    });
});
