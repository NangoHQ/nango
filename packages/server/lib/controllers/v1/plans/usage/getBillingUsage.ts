import { billing } from '@nangohq/billing';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { toApiBillingUsageMetrics } from '../../../../formatters/billingUsage.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { linkBillingCustomer, linkBillingFreeSubscription } from '../../../../utils/billing.js';
import { usageTracker } from '../../../../utils/usage.js';

import type { GetBillingUsage } from '@nangohq/types';

export const getBillingUsage = asyncWrapper<GetBillingUsage>(async (req, res) => {
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

    // Backfill orb customer
    if (!plan.orb_customer_id) {
        const linkOrbCustomerRes = await linkBillingCustomer(account, user);
        if (linkOrbCustomerRes.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to link billing customer' } });
            return;
        }
    }

    // Backfill orb subscription (free by default)
    if (!plan.orb_subscription_id && plan.name === 'free') {
        const linkOrbSubscriptionRes = await linkBillingFreeSubscription(account);
        if (linkOrbSubscriptionRes.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to link billing subscription' } });
            return;
        }
    }

    const customerRes = await billing.getCustomer(account.id);
    if (customerRes.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get customer' } });
        return;
    }

    if (!plan.orb_subscription_id) {
        res.status(500).send({ error: { code: 'server_error', message: 'Billing subscription not found' } });
        return;
    }

    const now = new Date();
    const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
    const previousMonthUsage = await usageTracker.getBillingUsage(plan.orb_subscription_id, {
        timeframe: { start: previousMonthStart, end: previousMonthEnd },
        granularity: 'day'
    });
    const currentMonthUsage = await usageTracker.getBillingUsage(plan.orb_subscription_id, {
        granularity: 'day'
    });

    if (currentMonthUsage.isErr() || previousMonthUsage.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get usage' } });
        return;
    }

    res.status(200).send({
        data: {
            customer: customerRes.value,
            current: toApiBillingUsageMetrics(currentMonthUsage.value),
            previous: toApiBillingUsageMetrics(previousMonthUsage.value)
        }
    });
});
