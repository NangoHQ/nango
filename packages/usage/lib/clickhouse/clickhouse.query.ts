import type { UsageEvent, UsageMetric } from '@nangohq/types';

interface GetUsageQueryMetricDimensions<TDimension extends string = 'none'> {
    dimension: 'none' | 'environment_id' | 'integration_id' | TDimension;
}

type ValidateMetrics<T extends Record<UsageMetric, unknown> & Record<Exclude<keyof T, UsageMetric>, never>> = T;

type GetUsageQueryMetrics = ValidateMetrics<{
    connections: GetUsageQueryMetricDimensions;
    records: GetUsageQueryMetricDimensions<'connection_id' | 'model'>;
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
            return `daily_records`;
        case 'connections':
            return `daily_connections`;
    }
}

export function quantityForMetric(metric: UsageMetric): string {
    switch (metric) {
        case 'function_executions':
        case 'proxy':
        case 'webhook_forwards':
            return `SUM(value)`;
        case 'function_logs':
            return `SUM(custom_logs)`;
        case 'function_compute_gbms':
            return `SUM(compute_gbms)`;
        case 'records':
        case 'connections':
            return `avgMerge(value)`;
    }
}
