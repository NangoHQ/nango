import type { UsageEvent, UsageMetric } from '@nangohq/types';

// Top-N + 'rest' breakdown bound. Cap exists so callers can't blow up the
// response — the long tail can be tens of thousands of values (e.g. `records`
// by `connection_id` on a large account).
export const TOP_N_BREAKDOWN_DEFAULT = 10;
export const TOP_N_BREAKDOWN_CAP = 25;

export type CounterUsageMetric = Exclude<UsageMetric, 'records' | 'connections'>;
export type AvgUsageMetric = Extract<UsageMetric, 'records' | 'connections'>;

export const COUNTER_METRICS = [
    'proxy',
    'function_executions',
    'function_logs',
    'function_compute_gbms',
    'webhook_forwards'
] as const satisfies readonly CounterUsageMetric[];
export const AVG_METRICS = ['records', 'connections'] as const satisfies readonly AvgUsageMetric[];

// Per-metric dimension whitelist — single source of truth. The query types
// below derive their `dimension` union from this const, and the controller
// imports it to validate the `breakdown[<m>]=<d>` querystring.
export const BREAKDOWN_DIMENSIONS = {
    proxy: ['environment_id', 'integration_id', 'connection_id', 'success'],
    function_executions: ['environment_id', 'integration_id', 'connection_id', 'function_name', 'function_type', 'success'],
    function_logs: ['environment_id', 'integration_id', 'connection_id', 'function_name', 'function_type', 'success'],
    function_compute_gbms: ['environment_id', 'integration_id', 'connection_id', 'function_name', 'function_type', 'success'],
    webhook_forwards: ['environment_id', 'integration_id', 'connection_id', 'success'],
    records: ['environment_id', 'integration_id', 'connection_id', 'model'],
    connections: ['environment_id', 'integration_id']
} as const satisfies Record<UsageMetric, readonly string[]>;

type DimensionFor<M extends UsageMetric> = 'none' | (typeof BREAKDOWN_DIMENSIONS)[M][number];

export function isAllowedDimensionFor(metric: UsageMetric, dimension: string): boolean {
    if (dimension === 'none') return true;
    return (BREAKDOWN_DIMENSIONS[metric] as readonly string[]).includes(dimension);
}

export type GetDailyCounterQuery = {
    [M in CounterUsageMetric]: {
        accountId: UsageEvent['payload']['properties']['accountId'];
        metric: M;
        dimension: DimensionFor<M>;
        // Optional top-N breakdown size when `dimension !== 'none'`. Defaults
        // to TOP_N_BREAKDOWN_DEFAULT, clamped server-side to TOP_N_BREAKDOWN_CAP.
        top?: number;
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
    }
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
            return `SUM(compute_gbms)`;
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
