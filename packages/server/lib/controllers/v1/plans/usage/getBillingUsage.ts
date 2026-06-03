import z from 'zod';

import { billing } from '@nangohq/billing';
import { BREAKDOWN_DIMENSIONS, TOP_N_BREAKDOWN_CAP } from '@nangohq/usage';
import { zodErrorToHTTP } from '@nangohq/utils';

import { toApiBillingUsageMetrics } from '../../../../formatters/billingUsage.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { linkBillingCustomer, linkBillingFreeSubscription } from '../../../../utils/billing.js';
import { usageTracker } from '../../../../utils/usage.js';

import type { GetBillingUsage, GetBillingUsageOpts, UsageMetric } from '@nangohq/types';

// z.enum(BREAKDOWN_DIMENSIONS[m]) — output type is the per-metric dim union,
// matching `BreakdownDimensions[m]` from @nangohq/types. Single source of
// truth for the (metric, dim) whitelist; empty strings rejected structurally
// (not in the enum), no `.refine` needed.
const breakdownSchema = z
    .object({
        proxy: z.enum(BREAKDOWN_DIMENSIONS.proxy).optional(),
        function_executions: z.enum(BREAKDOWN_DIMENSIONS.function_executions).optional(),
        function_logs: z.enum(BREAKDOWN_DIMENSIONS.function_logs).optional(),
        function_compute_gbms: z.enum(BREAKDOWN_DIMENSIONS.function_compute_gbms).optional(),
        webhook_forwards: z.enum(BREAKDOWN_DIMENSIONS.webhook_forwards).optional(),
        records: z.enum(BREAKDOWN_DIMENSIONS.records).optional(),
        connections: z.enum(BREAKDOWN_DIMENSIONS.connections).optional()
    })
    .strict()
    .optional();

// Filter values arrive as `<dim>:<value>` strings (Express qs bracket
// notation). Split on the FIRST ':' so values containing ':' (e.g. URLs)
// survive intact. Returns `{ dimension, value }` on success.
const parseFilter = (allowedDims: readonly string[]) =>
    z
        .string()
        .min(1)
        .transform((s, ctx) => {
            const colon = s.indexOf(':');
            if (colon < 1 || colon === s.length - 1) {
                ctx.addIssue({ code: 'custom', message: 'expected "<dim>:<value>"' });
                return z.NEVER;
            }
            const dimension = s.slice(0, colon);
            const value = s.slice(colon + 1);
            if (!allowedDims.includes(dimension)) {
                ctx.addIssue({ code: 'custom', message: `invalid dimension "${dimension}" for this metric` });
                return z.NEVER;
            }
            return { dimension, value };
        });

// `satisfies Record<UsageMetric, …>` forces an entry per metric — adding a
// new `UsageMetric` without updating this object fails to typecheck.
const filterFields = {
    proxy: parseFilter(BREAKDOWN_DIMENSIONS.proxy).optional(),
    function_executions: parseFilter(BREAKDOWN_DIMENSIONS.function_executions).optional(),
    function_logs: parseFilter(BREAKDOWN_DIMENSIONS.function_logs).optional(),
    function_compute_gbms: parseFilter(BREAKDOWN_DIMENSIONS.function_compute_gbms).optional(),
    webhook_forwards: parseFilter(BREAKDOWN_DIMENSIONS.webhook_forwards).optional(),
    records: parseFilter(BREAKDOWN_DIMENSIONS.records).optional(),
    connections: parseFilter(BREAKDOWN_DIMENSIONS.connections).optional()
} satisfies Record<UsageMetric, z.ZodTypeAny>;

const filterSchema = z.object(filterFields).strict().optional();

const ALL_METRICS = Object.keys(BREAKDOWN_DIMENSIONS) as [UsageMetric, ...UsageMetric[]];

const querySchema = z
    .object({
        env: z.string(),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        // Per-request dashboard backend override. Webapp picks it up from
        // localStorage('nango.billingUsageSource') and forwards. Honoured
        // server-side only when FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE is on (dev
        // gate). Without the gate, this is ignored and the dashboard stays
        // on Orb.
        source: z.enum(['clickhouse', 'orb']).optional(),
        // Repeated-key array (`?metrics=records&metrics=connections`) —
        // scopes the response to just those metrics. Empty / unset → all 7
        // (page-load shape). Used by the drilldown UI to fetch just the
        // metric the user opened. Honoured only on the CH path; Orb path
        // ignores it for now. Preprocess wraps the single-value case
        // (`?metrics=records` → string) into an array so the enum check
        // applies uniformly.
        metrics: z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.enum(ALL_METRICS)).nonempty().optional()),
        // Per-metric breakdown spec, Express qs parses `breakdown[<metric>]=<dim>`
        // into `{ <metric>: <dim>, … }`. Honoured only on the CH path; the
        // Orb client ignores it silently for now.
        breakdown: breakdownSchema,
        // Top-N for breakdown. Capped at TOP_N_BREAKDOWN_CAP at the schema level
        // so requests exceeding it 400 rather than silently clamping — the SQL
        // also clamps defensively (see `Clickhouse.getDailyCounter`).
        top: z.coerce.number().int().positive().max(TOP_N_BREAKDOWN_CAP).optional(),
        // Per-metric row-level filter, `filter[<metric>]=<dim>:<value>`.
        // Mutually exclusive with `breakdown[<metric>]` on the same metric
        // (rejected by the refine below). CH path only.
        filter: filterSchema
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
    )
    .refine(
        (data) => {
            if (!data.filter || !data.breakdown) return true;
            for (const m of Object.keys(data.filter) as UsageMetric[]) {
                if (data.filter[m] && data.breakdown[m]) return false;
            }
            return true;
        },
        {
            message: 'filter and breakdown are mutually exclusive on the same metric',
            path: ['filter']
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
        ...(query.breakdown ? { breakdown: query.breakdown } : {}),
        ...(query.top ? { top: query.top } : {}),
        // zod's transform widens `dimension` to `string`; per-metric whitelist
        // is enforced at parse time, so the cast is safe.
        ...(query.filter ? { filter: query.filter as NonNullable<GetBillingUsageOpts['filter']> } : {})
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
