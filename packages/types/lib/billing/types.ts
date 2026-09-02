import type { Result } from '../result.js';
import type { DBTeam } from '../team/db.js';
import type { UsageMetric } from '../usage/index.js';

export interface BillingClient {
    ingest: (events: BillingEvent[]) => Promise<Result<void>>;
    linkStripeToCustomer(teamId: number, customerId: string): Promise<Result<void>>;
    getOrCreateCustomer: (accountId: number, defaultTo: Pick<BillingInvoicingDetails, 'legalEntityName' | 'email'>) => Promise<Result<BillingCustomer>>;
    getCustomer: (accountId: number) => Promise<Result<BillingCustomer>>;
    putCustomer: (accountId: number, invoicingDetails: BillingInvoicingDetails) => Promise<Result<BillingCustomer>>;
    getSubscription: (accountId: number) => Promise<Result<BillingSubscription | null>>;
    getOverdueInvoices: (accountId: number) => Promise<Result<BillingOverdueInvoices>>;
    getUpcomingInvoice: (subscriptionId: string) => Promise<Result<BillingUpcomingInvoice | null>>;
    getPeriodCosts: (subscriptionId: string) => Promise<Result<BillingPeriodCosts | null>>;
    getSpendAlert: (subscriptionId: string) => Promise<Result<BillingSpendAlert | null>>;
    setSpendAlert: (subscriptionId: string, opts: { thresholdInCents: number }) => Promise<Result<BillingSpendAlert>>;
    removeSpendAlert: (subscriptionId: string) => Promise<Result<void>>;
    createSubscription: (team: DBTeam, planExternalId: string) => Promise<Result<BillingSubscription>>;
    getUsage: (subscriptionId: string, opts?: GetBillingUsageOpts) => Promise<Result<BillingUsageMetrics>>;
    upgrade: (opts: { subscriptionId: string; planExternalId: string }) => Promise<Result<{ pendingChangeId: string; amountInCents: number | null }>>;
    downgrade: (opts: { subscriptionId: string; planExternalId: string }) => Promise<Result<void>>;
    applyPendingChanges: (opts: {
        pendingChangeId: string;
        /**
         * Payment collected up front.
         *
         * Omitted for a plan billed fully in arrears, where nothing is collected when the change is applied.
         */
        payment?:
            | {
                  /** The external payment ID; for Stripe, it's the PaymentIntent ID. */
                  externalId: string;
                  /** Amount collected in dollars. */
                  amountCollected: string;
              }
            | undefined;
    }) => Promise<Result<BillingSubscription>>;
    cancelPendingChanges: (opts: { pendingChangeId: string }) => Promise<Result<void>>;
    verifyWebhookSignature(body: string, headers: Record<string, unknown>, secret: string): Result<true>;
    getPlanById(planId: string): Promise<Result<BillingPlan>>;
}

export interface BillingCustomer {
    id: string;
    invoicingDetails: BillingInvoicingDetails;
    portalUrl: string | null;
}

export interface BillingInvoicingDetails {
    legalEntityName: string;
    email: string;
    additionalEmails: string[];
    address: BillingAddress | null;
    taxId: BillingTaxId | null;
}

export interface BillingAddress {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
}

export interface BillingTaxId {
    country: string;
    type: string;
    value: string;
}

export interface BillingSubscription {
    id: string;
    pendingChangeId?: string | undefined;
    planExternalId: string;
}

export interface BillingOverdueInvoices {
    hasOverdue: boolean;
}

/** Orb's upcoming invoice for a subscription — the whole invoice, not a month's slice of it. */
export interface BillingUpcomingInvoice {
    amountInCents: number;
    /** ISO 4217, uppercased. Orb's `credits` is rejected upstream. */
    currency: string;
}

/** Orb's single `cost_exceeded` alert for a subscription; Orb holds all of its state. */
export interface BillingSpendAlert {
    id: string;
    thresholdInCents: number;
    /** ISO 4217, uppercased. Null when Orb reports a unit that isn't a currency. */
    currency: string | null;
}

export interface BillingPeriodCosts {
    /** Integer cents charged this billing period per metric, excluding every fixed price. A metric is
     *  absent when the subscription carries no price for it, which is not the same as being charged 0. */
    metrics: Partial<Record<UsageMetric, number>>;
    /** Metrics with a real price whose charge we couldn't read — an unparseable amount, or a currency
     *  other prices don't share. A charge exists; we just can't state it, so it reads as a dash, not $0. */
    malformedMetrics: UsageMetric[];
    /** False when a price maps to no metric of ours, so an unpriced row can't safely claim $0 — the
     *  money might be one of theirs. */
    fullyAttributed: boolean;
    /** The individual prices behind `malformedMetrics` and a false `fullyAttributed`, for alerting —
     *  not sent over HTTP. */
    flagged: { priceId: string; priceName: string; metric: UsageMetric | null; amountInCents: number | null }[];
    currency: string;
}

export type CounterUsageMetric = Exclude<UsageMetric, 'records' | 'connections'>;
export type AvgUsageMetric = Extract<UsageMetric, 'records' | 'connections'>;

// Per-metric dimension whitelist for the breakdown API. The runtime
// `BREAKDOWN_DIMENSIONS` const in @nangohq/usage `satisfies` this shape so the
// two stay in sync; consumers (controller validator, frontend contracts, CH
// query types) all derive from this single declaration.
export interface BreakdownDimensions {
    proxy: 'environment_id' | 'integration_id' | 'connection_id' | 'success';
    function_executions: 'environment_id' | 'integration_id' | 'connection_id' | 'function_name' | 'function_type' | 'success';
    function_logs: 'environment_id' | 'integration_id' | 'connection_id' | 'function_name' | 'function_type' | 'success';
    function_compute_gbms: 'environment_id' | 'integration_id' | 'connection_id' | 'function_name' | 'function_type' | 'success';
    function_duration_seconds: 'environment_id' | 'integration_id' | 'connection_id' | 'function_name' | 'function_type' | 'success';
    webhook_forwards: 'environment_id' | 'integration_id' | 'connection_id' | 'success';
    records: 'environment_id' | 'integration_id' | 'connection_id' | 'model';
    connections: 'environment_id' | 'integration_id';
    data_transfer: 'environment_id' | 'integration_id' | 'connection_id' | 'source';
}

// `'none'` is the in-band sentinel for "no breakdown" used by the CH query
// types; user-facing `breakdown[<m>]=<d>` requests only carry real dim values.
export type DimensionFor<M extends UsageMetric> = 'none' | BreakdownDimensions[M];

export interface GetBillingUsageOpts {
    timeframe?: {
        start: Date;
        end: Date;
    };
    granularity?: 'day';
    billingMetric?: {
        id: string;
        group_by?: 'environmentId' | 'environmentName' | 'integrationId' | 'type' | 'functionName' | 'model';
    };
    /**
     * Per-metric dimension breakdown spec, applied to CH-backed metrics
     * (records / connections via `getDailySumAndBatches`, counters via
     * `getDailyCounter`). Each metric's `BillingUsageMetric` gains a
     * `breakdown` array of up to `top + 1` series (top-N dimension
     * values + a single 'rest' aggregating the long tail). Top defaults
     * to 10 and is clamped server-side to the CH cap.
     */
    breakdown?: { [M in UsageMetric]?: BreakdownDimensions[M] | undefined };
    top?: number;
    /**
     * Subset of metrics to populate in the response. When set, only those
     * metrics are fanned out and returned. Omitted → all 7.
     */
    metrics?: UsageMetric[];
    /**
     * Per-metric row-level filter: scopes that metric's response to rows
     * where the given dimension equals the given value. Composes with
     * `breakdown[<metric>]` on the same metric when the dimensions differ
     * (drill-in: filter to one value, re-break-down by another); controllers
     * reject only the same-dimension pairing.
     */
    filter?: { [M in UsageMetric]?: { dimension: BreakdownDimensions[M]; value: string } | undefined };
    /**
     * AVG metrics (connections, records) are returned as the point-in-time daily count instead of
     * the billing running-average. Used by the Free caps view, where the cap is a concurrent
     * maximum. CH path only. Default false (billing running-average).
     */
    avgPerDay?: boolean;
}

export interface BillingUsageMetric {
    externalId: string;
    group?: {
        key: string;
        value: string;
    };
    /**
     * The top-N + 'rest' breakdown collapses every dim value outside the top
     * into a single rollup bucket. Marked with `isRest: true` so the dashboard
     * can distinguish it from a real dim value that happens to literally be
     * the string 'rest' (e.g. a `connection_id` or `model` named 'rest').
     * `group.value` is set to the display string 'rest' as a default; the
     * flag is the authoritative signal.
     */
    isRest?: true;
    total: number;
    usage: {
        timeframeStart: Date;
        timeframeEnd: Date;
        quantity: number;
    }[];
    view_mode: 'cumulative' | 'periodic';
    /**
     * Populated only when the request included a `breakdown` spec for this
     * metric AND the CH path served the request. Each entry is a per-
     * dimension-value series (carrying its own `group: {key, value}`), with
     * one 'rest' entry aggregating the long tail.
     *
     * Paired with the top-level `usage`/`total`: when a breakdown is requested
     * the top-level `usage` is empty (the per-day points live under `breakdown`)
     * and `total` is the sum across the top-N + 'rest' series, which partition
     * every row — so it equals the (filtered) global. When breakdown is NOT
     * requested, the top-level is the no-dim global and this is absent.
     */
    breakdown?: BillingUsageMetric[];
}

export type BillingUsageMetrics = Partial<Record<UsageMetric, BillingUsageMetric | undefined>>;

export interface ApiBillingUsageMetric extends BillingUsageMetric {
    label: string;
}

export type ApiBillingUsageMetrics = Record<UsageMetric, ApiBillingUsageMetric>;

export interface BillingPlan {
    id: string;
    external_plan_id: string;
}

type BillingPropertyValue = string | number | boolean | Date | undefined;
type BillingProperties = Record<string, BillingPropertyValue | Record<string, BillingPropertyValue>>;

interface BillingEventBase<TType extends string, TProperties extends BillingProperties = BillingProperties> {
    type: TType;
    properties: {
        timestamp: Date;
        idempotencyKey?: string | undefined;
        accountId: number;
        count: number;
    } & TProperties;
}

export type MarBillingEvent = BillingEventBase<
    'monthly_active_records',
    {
        environmentId: number;
        environmentName: string;
        integrationId: string;
        syncId: string;
        model: string;
    }
>;

export type RecordsBillingEvent = BillingEventBase<
    'records',
    {
        frequencyMs: number;
        telemetry: {
            sizeBytes: number;
        };
    }
>;

export type ActionsBillingEvent = BillingEventBase<
    'billable_actions',
    {
        environmentId: number;
        environmentName: string;
        integrationId: string;
        actionName: string;
    }
>;

export type FunctionExecutionsBillingEvent = BillingEventBase<
    'function_executions',
    {
        environmentId: number;
        environmentName: string;
        integrationId: string;
        type: string;
        functionName: string;
        telemetry: {
            successes: number;
            failures: number;
            durationMs: number;
            compute: number;
            customLogs: number;
            proxyCalls: number;
        };
        frequencyMs?: number | undefined;
    }
>;

export type ProxyBillingEvent = BillingEventBase<
    'proxy',
    {
        environmentId: number;
        environmentName: string;
        integrationId: string;
        telemetry: {
            successes: number;
            failures: number;
        };
    }
>;

export type WebhookForwardBillingEvent = BillingEventBase<
    'webhook_forwards',
    {
        environmentId: number;
        environmentName: string;
        integrationId: string;
        telemetry: {
            successes: number;
            failures: number;
        };
    }
>;

export type ConnectionsBillingEvent = BillingEventBase<'billable_connections'>;

export type ConnectionsBillingEventV2 = BillingEventBase<
    'billable_connections_v2',
    {
        frequencyMs: number;
    }
>;

export type BillingEvent =
    | MarBillingEvent
    | RecordsBillingEvent
    | ActionsBillingEvent
    | ProxyBillingEvent
    | WebhookForwardBillingEvent
    | FunctionExecutionsBillingEvent
    | ConnectionsBillingEvent
    | ConnectionsBillingEventV2;
