import z from 'zod';

import { billing } from '@nangohq/billing';
import { BREAKDOWN_DIMENSIONS, TOP_N_BREAKDOWN_CAP } from '@nangohq/usage';
import { zodErrorToHTTP } from '@nangohq/utils';

import { toApiBillingUsageMetrics } from '../../../../formatters/billingUsage.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { linkBillingCustomer, linkBillingFreeSubscription } from '../../../../utils/billing.js';
import { usageTracker } from '../../../../utils/usage.js';

import type { GetBillingUsage, UsageMetric } from '@nangohq/types';

const breakdownSchema = z
    .object({
        proxy: z.string().optional(),
        function_executions: z.string().optional(),
        function_logs: z.string().optional(),
        function_compute_gbms: z.string().optional(),
        webhook_forwards: z.string().optional(),
        records: z.string().optional(),
        connections: z.string().optional()
    })
    .strict()
    .optional()
    .refine((b) => !b || Object.entries(b).every(([m, d]) => !d || (BREAKDOWN_DIMENSIONS[m as UsageMetric] as readonly string[]).includes(d)), {
        message: 'Unsupported metric/dimension pair in breakdown'
    });

const ALL_METRICS = Object.keys(BREAKDOWN_DIMENSIONS) as [UsageMetric, ...UsageMetric[]];

const querySchema = z
    .object({
        env: z.string(),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        // Per-request dashboard backend override. Webapp picks it up from
        // localStorage('nango.billingUsageSource') and forwards. Honoured
        // server-side only when ALLOW_OVERRIDE_GETUSAGE_SERVICE is on (dev
        // gate). Without the gate, this is ignored and the dashboard stays
        // on Orb.
        source: z.enum(['clickhouse', 'orb']).optional(),
        // CSV subset of UsageMetric — scopes the response to just those
        // metrics. Empty / unset → all 7 (page-load shape). Used by the
        // drilldown UI to fetch just the metric the user opened. Honoured
        // only on the CH path; Orb path ignores it for now.
        metrics: z
            .string()
            .optional()
            .transform((s) => (s ? s.split(',') : undefined))
            .pipe(z.array(z.enum(ALL_METRICS)).nonempty().optional()),
        // Per-metric breakdown spec, Express qs parses `breakdown[<metric>]=<dim>`
        // into `{ <metric>: <dim>, … }`. Honoured only on the CH path; the
        // Orb client ignores it silently for now.
        breakdown: breakdownSchema,
        // Top-N for breakdown. Capped at TOP_N_BREAKDOWN_CAP at the schema level
        // so requests exceeding it 400 rather than silently clamping — the SQL
        // also clamps defensively (see `Clickhouse.getDailyCounter`).
        top: z.coerce.number().int().positive().max(TOP_N_BREAKDOWN_CAP).optional()
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

    // Note: parsed shape diverges from the wire shape (z.coerce.number for `top`
    // produces a number even though the wire is a string), so we type the local
    // by the parser output rather than the endpoint's Querystring.
    const query = parsedQuery.data;

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

    const usage = await usageTracker.getBillingUsage(plan.orb_subscription_id, account.id, {
        granularity: 'day',
        ...(query.from && query.to ? { timeframe: { start: new Date(query.from), end: new Date(query.to) } } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(query.metrics ? { metrics: query.metrics } : {}),
        ...(query.breakdown ? { breakdown: query.breakdown as Partial<Record<UsageMetric, string>> } : {}),
        ...(query.top ? { top: query.top } : {})
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
