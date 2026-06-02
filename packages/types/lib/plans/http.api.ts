import type { DBPlan } from './db.js';
import type { Endpoint } from '../api.js';
import type { ApiBillingUsageMetrics, BillingCustomer, BillingInvoicingDetails, BreakdownDimensions } from '../billing/types.js';
import type { MetricUsageSummary, UsageMetric } from '../usage/index.js';
import type { ReplaceInObject } from '../utils.js';

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

// Top-N seen dimension values for (metric, dimension) over a timeframe.
// Populates the filter dropdown UI on the billing-usage dashboard.
export type GetBillingUsageTopValues = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/plans/billing-usage/top-values';
    Querystring: {
        env: string;
        metric: UsageMetric;
        // Dimension to enumerate values for. Must be a member of
        // `BreakdownDimensions[metric]`; validated server-side.
        dimension: string;
        from?: string | undefined;
        to?: string | undefined;
        // Number of values to return. Defaults to 10, server-capped.
        limit?: string | undefined;
    };
    Success: {
        data: {
            values: string[];
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
