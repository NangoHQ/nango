import z from 'zod';

import { billing } from '@nangohq/billing';
import { zodErrorToHTTP } from '@nangohq/utils';

import { toApiBillingUsageMetrics } from '../../../../formatters/billingUsage.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { linkBillingCustomer, linkBillingFreeSubscription } from '../../../../utils/billing.js';
import { usageTracker } from '../../../../utils/usage.js';

import type { GetBillingUsage } from '@nangohq/types';

const querySchema = z
    .object({
        env: z.string(),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional()
    })
    .refine(
        (data) => {
            if (data.from && data.to) {
                return new Date(data.from) <= new Date(data.to);
            }
            return true;
        },
        {
            message: 'From date must be before to date',
            path: ['from']
        }
    );

export const getBillingUsage = asyncWrapper<GetBillingUsage>(async (req, res) => {
    const parsedQuery = querySchema.safeParse(req.query);
    if (!parsedQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(parsedQuery.error) } });
        return;
    }

    const query: GetBillingUsage['Querystring'] = parsedQuery.data;

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

    const usage = await usageTracker.getBillingUsage(plan.orb_subscription_id, {
        granularity: 'day',
        ...(query.from && query.to ? { timeframe: { start: new Date(query.from), end: new Date(query.to) } } : {})
    });

    if (usage.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to get usage' } });
        return;
    }

    res.status(200).send({
        data: {
            customer: customerRes.value,
            usage: toApiBillingUsageMetrics(usage.value)
        }
    });
});
