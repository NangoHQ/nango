import { billing } from '@nangohq/billing';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { isSpendPlan } from './spendPlans.js';

import type { GetUpcomingInvoice } from '@nangohq/types';

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

    if (!isSpendPlan(plan)) {
        res.status(200).send({ data: NO_SPEND });
        return;
    }

    // A spend plan can exist before its Orb subscription is linked — granted manually, or a
    // deployment with billing switched off. No figure to state, not a failure.
    if (!plan.orb_subscription_id) {
        res.status(200).send({ data: NO_SPEND });
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
