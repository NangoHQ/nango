import z from 'zod';

import { billing } from '@nangohq/billing';
import { BREAKDOWN_DIMENSIONS, FILTER_PARAM_TYPE_FOR_DIM, TOP_N_BREAKDOWN_CAP } from '@nangohq/usage';
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
// `satisfies Record<UsageMetric, …>` forces an entry per metric — adding a
// new `UsageMetric` without updating this object fails to typecheck.
const breakdownFields = {
    proxy: z.enum(BREAKDOWN_DIMENSIONS.proxy).optional(),
    function_executions: z.enum(BREAKDOWN_DIMENSIONS.function_executions).optional(),
    function_logs: z.enum(BREAKDOWN_DIMENSIONS.function_logs).optional(),
    function_compute_gbms: z.enum(BREAKDOWN_DIMENSIONS.function_compute_gbms).optional(),
    webhook_forwards: z.enum(BREAKDOWN_DIMENSIONS.webhook_forwards).optional(),
    records: z.enum(BREAKDOWN_DIMENSIONS.records).optional(),
    connections: z.enum(BREAKDOWN_DIMENSIONS.connections).optional(),
    data_transfer: z.enum(BREAKDOWN_DIMENSIONS.data_transfer).optional()
} satisfies Record<UsageMetric, z.ZodTypeAny>;

const breakdownSchema = z.object(breakdownFields).strict().optional();

// Filter values arrive as `<dim>:<value>` strings (Express qs bracket
// notation). Split on the FIRST ':' so values containing ':' (e.g. URLs)
// survive intact. Returns `{ dimension, value }` on success.
//
// Typed dimensions (`environment_id: Int64`, `success: Bool`) get their
// value validated here so unparseable inputs surface as 400 instead of
// bubbling to a 500 when CH rejects the parameter binding downstream.
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
            const paramType = FILTER_PARAM_TYPE_FOR_DIM[dimension] ?? 'String';
            if (paramType === 'Int64' && !/^-?\d+$/.test(value)) {
                ctx.addIssue({ code: 'custom', message: `value "${value}" is not a valid integer for dimension "${dimension}"` });
                return z.NEVER;
            }
            if (paramType === 'Bool' && value !== 'true' && value !== 'false') {
                ctx.addIssue({ code: 'custom', message: `value "${value}" is not a valid boolean for dimension "${dimension}" (expected "true" or "false")` });
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
    connections: parseFilter(BREAKDOWN_DIMENSIONS.connections).optional(),
    data_transfer: parseFilter(BREAKDOWN_DIMENSIONS.data_transfer).optional()
} satisfies Record<UsageMetric, z.ZodTypeAny>;

const filterSchema = z.object(filterFields).strict().optional();

const ALL_METRICS = Object.keys(BREAKDOWN_DIMENSIONS) as [UsageMetric, ...UsageMetric[]];

const querySchema = z
    .object({
        env: z.string(),
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        // Repeated-key array (`?metrics=records&metrics=connections`) —
        // scopes the response to just those metrics. Empty / unset → all 7
        // (page-load shape). Used by the drilldown UI to fetch just the
        // metric the user opened. Preprocess wraps the single-value case
        // (`?metrics=records` → string) into an array so the enum check
        // applies uniformly.
        metrics: z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.enum(ALL_METRICS)).nonempty().optional()),
        // Per-metric breakdown spec, Express qs parses `breakdown[<metric>]=<dim>`
        // into `{ <metric>: <dim>, … }`.
        breakdown: breakdownSchema,
        // Top-N for breakdown. Capped at TOP_N_BREAKDOWN_CAP at the schema level
        // so requests exceeding it 400 rather than silently clamping — the SQL
        // also clamps defensively (see `Clickhouse.getDailyCounter`).
        top: z.coerce.number().int().positive().max(TOP_N_BREAKDOWN_CAP).optional(),
        // Per-metric row-level filter, `filter[<metric>]=<dim>:<value>`.
        // Composes with `breakdown[<metric>]`: the SQL applies the filter inside
        // the breakdown branch, so e.g. filter `integration_id:hubspot` + break
        // down by `connection` yields a per-connection breakdown of just hubspot's
        // rows. The one rejected case is filtering and breaking down by the SAME
        // dim (e.g. filter `integration_id:hubspot` + breakdown `integration_id`):
        // that produces a single-value "breakdown" — just the filter restated — so
        // the refine below 400s it.
        filter: filterSchema,
        // AVG metrics as point-in-time daily counts (Free caps view). Query arrives as a string.
        avgPerDay: z.stringbool().optional()
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
            // Filter + breakdown compose on the same metric (the SQL applies the
            // filter inside the breakdown branch), EXCEPT when both target the
            // same dimension — filtering `integration_id:hubspot` while breaking
            // down by `integration_id` is degenerate (a single-value split).
            for (const m of Object.keys(data.filter) as UsageMetric[]) {
                const f = data.filter[m];
                const b = data.breakdown[m];
                if (f && b && f.dimension === b) return false;
            }
            return true;
        },
        {
            message: 'filter and breakdown cannot target the same dimension on a metric',
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
        ...(query.metrics ? { metrics: query.metrics } : {}),
        ...(query.breakdown ? { breakdown: query.breakdown } : {}),
        ...(query.top ? { top: query.top } : {}),
        // zod's transform widens `dimension` to `string`; per-metric whitelist
        // is enforced at parse time, so the cast is safe.
        ...(query.filter ? { filter: query.filter as NonNullable<GetBillingUsageOpts['filter']> } : {}),
        ...(query.avgPerDay ? { avgPerDay: true } : {})
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
