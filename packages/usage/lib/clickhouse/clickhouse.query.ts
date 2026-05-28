import type { UsageEvent, UsageMetric } from '@nangohq/types';

// Top-N + 'rest' breakdown: any dimension query is collapsed to the top N
// dimension values (by SUM of the metric's quantity over the window) plus a
// single 'rest' bucket aggregating the long tail. Cap exists so callers can't
// blow up the response — the long tail can be tens of thousands of values
// (e.g., `records` by `connection_id` on the doomsday account).
export const TOP_N_BREAKDOWN_DEFAULT = 10;
export const TOP_N_BREAKDOWN_CAP = 25;

interface GetUsageQueryMetricDimensions<TDimension extends string = 'none'> {
    dimension: 'none' | 'environment_id' | 'integration_id' | TDimension;
    // Optional override for the top-N breakdown size when `dimension !== 'none'`.
    // Defaults to TOP_N_BREAKDOWN_DEFAULT, clamped server-side to TOP_N_BREAKDOWN_CAP.
    top?: number;
}

// `getUsage` covers counter metrics only — the SUM-aggregated tables that don't
// carry a `batch_id` column. AVG-style metrics (`records`, `connections`) are
// served by `getDailySumAndBatches`, which exposes the two accumulators their
// `view_mode='cumulative'` rendering needs and isn't expressible in this query
// shape.
export type CounterUsageMetric = Exclude<UsageMetric, 'records' | 'connections'>;

type ValidateMetrics<T extends Record<CounterUsageMetric, unknown> & Record<Exclude<keyof T, CounterUsageMetric>, never>> = T;

type GetUsageQueryMetrics = ValidateMetrics<{
    proxy: GetUsageQueryMetricDimensions<'connection_id' | 'success'>;
    webhook_forwards: GetUsageQueryMetricDimensions<'connection_id' | 'success'>;
    function_executions: GetUsageQueryMetricDimensions<'connection_id' | 'function_name' | 'function_type' | 'success'>;
    function_logs: GetUsageQueryMetricDimensions<'connection_id' | 'function_name' | 'function_type' | 'success'>;
    function_compute_gbms: GetUsageQueryMetricDimensions<'connection_id' | 'function_name' | 'function_type' | 'success'>;
}>;
export interface GetUsageQuery {
    accountId: UsageEvent['payload']['properties']['accountId'];
    metrics: Partial<GetUsageQueryMetrics>;
    granularity: 'day' | 'none';
    timeframe: {
        // exclusive end (ie: the timeframe includes events with timestamp >= start and < end)
        start: Date;
        end: Date;
    };
}

interface GetUsageResultDataPoint {
    timeframe: {
        start: Date;
        end: Date;
    };
    quantity: number;
}

export type GetUsageResultSeries =
    | { total: number; dataPoints: GetUsageResultDataPoint[] }
    | { dimension: string; dimensionValue: string | number | boolean; total: number; dataPoints: GetUsageResultDataPoint[] };

export interface GetUsageResult {
    accountId: GetUsageQuery['accountId'];
    granularity: GetUsageQuery['granularity'];
    metrics: Partial<
        Record<
            UsageMetric,
            {
                series: GetUsageResultSeries[];
                total: number;
                view_mode: 'cumulative' | 'periodic';
            }
        >
    >;
}

export function granularityGroupBy(query: GetUsageQuery): string {
    switch (query.granularity) {
        case 'day':
            return `, day`;
        case 'none':
            return '';
    }
}

export function granularityOrderBy(query: GetUsageQuery): string {
    switch (query.granularity) {
        case 'day':
            return `, day`;
        case 'none':
            return '';
    }
}

export function startSelect(query: GetUsageQuery): string {
    switch (query.granularity) {
        case 'day':
            return `day AS start, addDays(day, 1) AS end`;
        case 'none':
            return `toDateTime64(${query.timeframe.start.getTime() / 1000}, 3) AS start,
                    toDateTime64(${query.timeframe.end.getTime() / 1000}, 3) AS end`;
    }
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

// Counter metrics only — AVG-style metrics (`records`, `connections`) are not
// reachable through `getUsage` (excluded from `GetUsageQuery.metrics` at the
// type level) and use `getDailySumAndBatches` instead.
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

// ----------------------------------------------------------------------------
// Per-day (sum, batches) accumulators for AVG-style metrics — `records` and
// `connections` only, which are the two metrics whose write path tags each
// metering-cron firing with a `batch_id` column (one batch = one Orb event in
// the `average(count)` billable metric). Other metrics live in counter tables
// that lack `batch_id` and don't need this shape, so the type is intentionally
// restricted at compile time.
//
// Returns the two accumulators the server-side formatter needs to reconstruct
// the running period average for `view_mode='cumulative'`:
//   running_avg(D) = SUM(value)[start..D] / uniqExact(batch_id)[start..D]
//
// `batches` is the number of distinct `batch_id`s for the day (NOT the row
// count — each batch contributes multiple rows, one per slice). For the
// dimension breakdown, `batches` is the GLOBAL per-day count (same for every
// dimension value) so per-dimension running averages sum to the global
// running average exactly — see Clickhouse.getDailySumAndBatches docstring.
// ----------------------------------------------------------------------------

export type GetDailySumAndBatchesQuery =
    | {
          accountId: number;
          metric: 'records';
          dimension: 'none' | 'environment_id' | 'integration_id' | 'connection_id' | 'model';
          // Optional top-N breakdown size when `dimension !== 'none'`. Defaults to
          // TOP_N_BREAKDOWN_DEFAULT, clamped server-side to TOP_N_BREAKDOWN_CAP.
          top?: number;
          timeframe: {
              // exclusive end (timeframe includes events with timestamp >= start and < end)
              start: Date;
              end: Date;
          };
      }
    | {
          accountId: number;
          metric: 'connections';
          dimension: 'none' | 'environment_id' | 'integration_id';
          top?: number;
          timeframe: { start: Date; end: Date };
      };

export interface GetDailySumAndBatchesDay {
    day: Date;
    sum: number;
    batches: number;
}

export type GetDailySumAndBatchesSeries =
    | { days: GetDailySumAndBatchesDay[] }
    | { dimension: string; dimensionValue: string | number | boolean; days: GetDailySumAndBatchesDay[] };

export interface GetDailySumAndBatchesResult {
    accountId: number;
    metric: 'records' | 'connections';
    series: GetDailySumAndBatchesSeries[];
}
