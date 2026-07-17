import type { Endpoint } from '../api.js';
import type { ApiBillingUsageMetrics, BillingCustomer, BillingInvoicingDetails, BreakdownDimensions } from '../billing/types.js';
import type { MetricUsageSummary, UsageMetric } from '../usage/index.js';
import type { ReplaceInObject } from '../utils.js';
import type { DBPlan } from './db.js';

export type ApiPlan = ReplaceInObject<DBPlan, Date, string>;

export type PostPlanExtendTrial = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/plans/trial/extension';
    Querystring: { env: string };
    Success: {
        data: { success: boolean };
    };
}>;

export interface PlanDefinition {
    /**
     * Maps to orb external plan id
     */
    code: DBPlan['name'];
    title: string;
    description: string;
    canChange: boolean;
    nextPlan: string[] | null;
    prevPlan: string[] | null;
    basePrice?: number;

    cta?: string;
    hidden?: boolean;
    flags: Omit<Partial<DBPlan>, 'id' | 'account_id' | 'name'>;
}

export type GetPlans = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans';
    Querystring: { env: string };
    Success: {
        data: PlanDefinition[];
    };
}>;

export type GetPlan = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans/current';
    Querystring: { env: string };
    Success: {
        data: ApiPlan;
    };
}>;

export type GetUsage = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans/usage';
    Querystring: { env: string };
    Success: {
        data: Record<UsageMetric, MetricUsageSummary>;
    };
}>;

// Seen dimension values for (metric, dimension) over a timeframe, ordered by
// volume DESC. Populates the filter dropdown UI on the billing-usage
// dashboard. A `search` term narrows to matching values across the customer's
// FULL set (not just the top page), and `page` walks the long tail so any
// value is reachable by name/substring without typing it verbatim.
//
// Querystring is a per-metric discriminated union so the `dimension` field is
// constrained to the metric's whitelist at compile time; the controller's zod
// schema enforces the same shape at runtime.
export type GetBillingUsageTopDimensionValues = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans/billing-usage/top-dimension-values';
    Querystring: {
        [M in UsageMetric]: {
            env: string;
            metric: M;
            dimension: BreakdownDimensions[M];
            from: string;
            to: string;
            // Case-insensitive substring match on the dimension value. Applied
            // server-side (ClickHouse) so values below the first page are
            // reachable. Ignored for `environment_id` (filtered client-side by
            // label — its set is tiny and always fits the first page).
            search?: string | undefined;
            // Zero-based page index; page size is fixed server-side.
            page?: string | undefined;
        };
    }[UsageMetric];
    Success: {
        data: {
            // `id` is the raw CH value (used to filter back); `label` is the
            // display string — resolved server-side for `environment_id`,
            // equal to `id` for the other slug-ish dims.
            values: { id: string; label: string }[];
            // `hasMore` is a page-full heuristic (this page came back full),
            // so the picker can offer "load more" without a count query.
            pagination: { page: number; limit: number; hasMore: boolean };
        };
    };
}>;

export type GetBillingUsage = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans/billing-usage';
    Querystring: {
        env: string;
        from?: string | undefined;
        to?: string | undefined;
        source?: 'clickhouse' | 'orb' | undefined;
        // Subset of UsageMetric carried as repeated-key array
        // (`?metrics=records&metrics=connections`). When set on the CH path,
        // only those metrics are fanned out and populated in the response;
        // omitted → all 7. Ignored on the Orb path for now (Orb call still
        // returns everything it has).
        metrics?: UsageMetric[] | undefined;
        // Express qs bracket notation: `breakdown[<metric>]=<dimension>` →
        // `breakdown: { records: 'connection_id', … }`. Per-metric dimension
        // spec, typed via `BreakdownDimensions` so the (metric, dim) pairs
        // are constrained at compile time; the same whitelist is enforced
        // at runtime by the controller's zod schema.
        breakdown?: { [M in UsageMetric]?: BreakdownDimensions[M] | undefined } | undefined;
        top?: string | undefined;
        // Express qs bracket notation: `filter[<metric>]=<dim>:<value>` →
        // `filter: { records: 'integration_id:hubspot', … }`. Server splits
        // the string on the first ':' so values containing ':' stay intact.
        // Composes with `breakdown[<metric>]` on the same metric when the
        // dimensions differ; only the same-dimension pairing is rejected.
        filter?: Partial<Record<UsageMetric, string | undefined>> | undefined;
        // AVG metrics (connections, records) as point-in-time daily counts instead of the
        // billing running-average — used by the Free caps view. CH path only.
        avgPerDay?: boolean | undefined;
    };
    Success: {
        data: {
            customer: BillingCustomer;
            usage: ApiBillingUsageMetrics;
        };
    };
}>;

export type PutBillingInvoicingDetails = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/plans/billing/invoicing';
    Querystring: { env: string };
    Body: BillingInvoicingDetails;
    Success: {
        data: BillingCustomer;
    };
}>;

export type PostPlanChange = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/plans/change';
    Querystring: { env: string };
    Body: { orbId: string };
    Success: {
        data: { success: true } | { paymentIntent: any };
    };
}>;
