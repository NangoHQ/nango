import type { AvgUsageMetric, BreakdownDimensions, CounterUsageMetric, DimensionFor, UsageEvent, UsageMetric } from '@nangohq/types';

export type { AvgUsageMetric, CounterUsageMetric, DimensionFor } from '@nangohq/types';

// Top-N + 'rest' breakdown bound. Cap exists so callers can't blow up the
// response — the long tail can be tens of thousands of values (e.g. `records`
// by `connection_id` on a large account).
export const TOP_N_BREAKDOWN_DEFAULT = 10;
export const TOP_N_BREAKDOWN_CAP = 25;

// `satisfies Record<…, true>` on the set object forces an entry per metric;
// projecting via `Object.keys` gives the runtime array. Adding a new metric
// to `CounterUsageMetric` / `AvgUsageMetric` without updating the set fails
// to typecheck.
const COUNTER_METRICS_SET = {
    proxy: true,
    function_executions: true,
    function_logs: true,
    function_compute_gbms: true,
    webhook_forwards: true,
    data_transfer: true
} satisfies Record<CounterUsageMetric, true>;
const AVG_METRICS_SET = {
    records: true,
    connections: true
} satisfies Record<AvgUsageMetric, true>;
export const COUNTER_METRICS = Object.keys(COUNTER_METRICS_SET) as CounterUsageMetric[];
export const AVG_METRICS = Object.keys(AVG_METRICS_SET) as AvgUsageMetric[];

// Runtime mirror of `BreakdownDimensions` from @nangohq/types — `satisfies`
// keeps the per-key arrays in sync with the per-key dim union. Single
// declaration site is the interface in types; this const carries the same
// information at runtime for SQL/zod consumers.
export const BREAKDOWN_DIMENSIONS = {
    proxy: ['environment_id', 'integration_id', 'connection_id', 'success'],
    function_executions: ['environment_id', 'integration_id', 'connection_id', 'function_name', 'function_type', 'success'],
    function_logs: ['environment_id', 'integration_id', 'connection_id', 'function_name', 'function_type', 'success'],
    function_compute_gbms: ['environment_id', 'integration_id', 'connection_id', 'function_name', 'function_type', 'success'],
    webhook_forwards: ['environment_id', 'integration_id', 'connection_id', 'success'],
    records: ['environment_id', 'integration_id', 'connection_id', 'model'],
    connections: ['environment_id', 'integration_id'],
    data_transfer: ['environment_id', 'integration_id', 'connection_id', 'package', 'callsite']
} as const satisfies { [M in keyof BreakdownDimensions]: readonly BreakdownDimensions[M][] };

export function isAllowedDimensionFor(metric: UsageMetric, dimension: string): boolean {
    if (dimension === 'none') return true;
    return (BREAKDOWN_DIMENSIONS[metric] as readonly string[]).includes(dimension);
}

// CH parameter type used when binding a filter value to a dimension column.
// Strings by default; non-string MV columns get their native type so CH
// parses the user-supplied value once at binding time, the comparison stays
// native, and any column-level data-skipping index applies. Default for
// unmapped dims is `String` — keep this map exhaustive vs the actual MV
// column types or filtered queries on unmapped non-string columns will fail.
export const FILTER_PARAM_TYPE_FOR_DIM: Record<string, 'Int64' | 'Bool' | 'String'> = {
    environment_id: 'Int64',
    success: 'Bool'
};

export type GetDailyCounterQuery = {
    [M in CounterUsageMetric]: {
        accountId: UsageEvent['payload']['properties']['accountId'];
        metric: M;
        dimension: DimensionFor<M>;
        // Optional top-N breakdown size when `dimension !== 'none'`. Defaults
        // to TOP_N_BREAKDOWN_DEFAULT, clamped server-side to TOP_N_BREAKDOWN_CAP.
        top?: number;
        // Optional row-level filter: scopes the SQL to rows where the given
        // dimension equals the given value. Used by the dashboard's per-metric
        // filter UX. The value is passed through CH's parameterized
        // `query_params` (no string interpolation of user input). Composes with
        // a breakdown (`dimension !== 'none'`) on a DIFFERENT dim — the SQL adds
        // the filter to the breakdown branch's WHERE clause — enabling the
        // drill-in "filter then re-break-down" view. Filtering and breaking down
        // by the SAME dim is degenerate; the controller rejects that upstream.
        filter?: { dimension: BreakdownDimensions[M]; value: string };
        // Override CH `max_execution_time` for this query. Defaults to the
        // dashboard ceiling; callers that race against a shorter wall-clock
        // (e.g. shadow path) set this to align server-side cancellation.
        maxExecutionSeconds?: number;
        timeframe: {
            // exclusive end (timeframe includes events with timestamp >= start and < end)
            start: Date;
            end: Date;
        };
    };
}[CounterUsageMetric];

export interface GetDailyCounterDay {
    day: Date;
    value: number;
}

export type GetDailyCounterSeries =
    | { days: GetDailyCounterDay[] }
    | { dimension: string; dimensionValue: string | number | boolean; days: GetDailyCounterDay[] }
    | { dimension: string; isRest: true; days: GetDailyCounterDay[] };

export interface GetDailyCounterResult {
    accountId: number;
    metric: CounterUsageMetric;
    series: GetDailyCounterSeries[];
}

export function tableForMetric(metric: UsageMetric): string {
    switch (metric) {
        case 'proxy':
            return `daily_proxy`;
        case 'function_executions':
        case 'function_logs':
        case 'function_compute_gbms':
            return `daily_function_executions`;
        case 'webhook_forwards':
            return `daily_webhook_forwards`;
        case 'records':
            return `daily_raw_records`;
        case 'connections':
            return `daily_raw_connections`;
        case 'data_transfer':
            return `daily_data_transfer`;
    }
}

// Quantity expression used to rank dimension values across ALL metrics.
// Counter metrics delegate to `quantityForMetric`; AVG metrics rank by raw
// `SUM(value)` — total event volume contributed by a dim value over the
// timeframe. This is NOT the running average (`sum/batches`) — that's a
// per-day series quantity, not a per-period scalar suitable for ordering.
// For the filter dropdown, "which values contributed the most data" is the
// right signal, so unweighted `SUM(value)` is fine even though days with
// more batches contribute proportionally more.
export function rankingQuantityForMetric(metric: UsageMetric): string {
    if (metric === 'records' || metric === 'connections') {
        return `SUM(value)`;
    }
    return quantityForMetric(metric);
}

// Top-N seen dimension values for (metric, dimension) over a timeframe.
// Returns a flat string list; the filter UI uses this to populate dropdowns.
export type GetTopDimensionValuesQuery = {
    [M in UsageMetric]: {
        accountId: number;
        metric: M;
        dimension: BreakdownDimensions[M];
        timeframe: { start: Date; end: Date };
        // Number of values to return. Clamped server-side to TOP_N_BREAKDOWN_CAP.
        limit: number;
    };
}[UsageMetric];

export interface GetTopDimensionValuesResult {
    accountId: number;
    metric: UsageMetric;
    dimension: string;
    values: string[];
}

export function quantityForMetric(metric: CounterUsageMetric): string {
    switch (metric) {
        case 'function_executions':
        case 'proxy':
        case 'webhook_forwards':
            return `SUM(value)`;
        case 'function_logs':
            return `SUM(custom_logs)`;
        case 'function_compute_gbms':
            // Misnomer: the metric key and the `compute_gbms` column survive
            // for back-compat, but the dashboard's billable quantity is raw
            // milliseconds (Orb's "Function compute time" = sum(durationMs)).
            // Read `duration_ms` so the CH path matches Orb 1:1.
            return `SUM(duration_ms)`;
        case 'data_transfer':
            return `SUM(ingressed_bytes + egressed_bytes)`;
    }
}

// Returns the two accumulators the server-side formatter needs to reconstruct
// the running period average for `view_mode='cumulative'`:
//   running_avg(D) = SUM(value)[start..D] / uniqExact(batch_id)[start..D]
//
// `batches` is the number of distinct `batch_id`s for the day (NOT the row
// count — each batch contributes multiple rows, one per slice). For the
// dimension breakdown, `batches` is the GLOBAL per-day count (same for every
// dimension value) so per-dimension running averages sum to the global
// running average exactly — see `Clickhouse.getDailySumAndBatches` docstring.
export type GetDailySumAndBatchesQuery = {
    [M in AvgUsageMetric]: {
        accountId: number;
        metric: M;
        dimension: DimensionFor<M>;
        top?: number;
        // Row-level filter (see GetDailyCounterQuery). For AVG metrics it
        // narrows BOTH `SUM(value)` and `uniqExact(batch_id)` to the filtered
        // rows. Filtered-only → a standalone running-avg for that value. Filter
        // + breakdown → the shared per-day batches denominator is itself
        // filtered, so the per-dim running averages stay additive to the
        // filtered global (the "within this slice" decomposition).
        filter?: { dimension: BreakdownDimensions[M]; value: string };
        // Override CH `max_execution_time` (see GetDailyCounterQuery).
        maxExecutionSeconds?: number;
        timeframe: { start: Date; end: Date };
    };
}[AvgUsageMetric];

export interface GetDailySumAndBatchesDay {
    day: Date;
    sum: number;
    batches: number;
}

export type GetDailySumAndBatchesSeries =
    | { days: GetDailySumAndBatchesDay[] }
    | { dimension: string; dimensionValue: string | number | boolean; days: GetDailySumAndBatchesDay[] }
    | { dimension: string; isRest: true; days: GetDailySumAndBatchesDay[] };

export interface GetDailySumAndBatchesResult {
    accountId: number;
    metric: AvgUsageMetric;
    series: GetDailySumAndBatchesSeries[];
}
