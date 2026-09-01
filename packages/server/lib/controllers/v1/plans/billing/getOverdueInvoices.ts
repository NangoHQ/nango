import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { authorizes } from '../../../../authz/resolve.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetOverdueInvoices } from '@nangohq/types';

export const getOverdueInvoices = asyncWrapper<GetOverdueInvoices>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account, plan } = res.locals;
    if (!plan) {
        res.status(400).send({ error: { code: 'feature_disabled' } });
        return;
    }

    // Keyed on the Orb relationship rather than the plan: an account that downgraded to free can
    // still owe an issued invoice. Without a customer there is nothing to owe, and this endpoint
    // reads, so it doesn't create one.
    if (!plan.orb_customer_id) {
        res.status(200).send({ data: { hasOverdue: false, portalUrl: null } });
        return;
    }

    const overdueRes = await billing.getOverdueInvoices(account.id);
    if (overdueRes.isErr()) {
        report(overdueRes.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get overdue invoices' } });
        return;
    }

    // Everyone gets `hasOverdue`, but the Orb portal link grants access by possession, so it's only
    // returned to members who can manage billing — others get a null URL. Fetch the customer only when
    // something is overdue and the caller can act on it; a failure here costs the CTA, not the warning.
    let portalUrl: string | null = null;
    if (overdueRes.value.hasOverdue && authorizes(res.locals, 'account:billing:payment_methods:create')) {
        const customerRes = await billing.getCustomer(account.id);
        if (customerRes.isErr()) {
            report(customerRes.error);
        } else {
            portalUrl = customerRes.value.portalUrl;
        }
    }

    res.status(200).send({
        data: {
            hasOverdue: overdueRes.value.hasOverdue,
            portalUrl
        }
    });
});
