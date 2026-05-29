export type UsageMetric =
    | 'proxy'
    | 'connections'
    | 'function_executions'
    | 'function_compute_gbms'
    | 'function_compute_ms'
    | 'records'
    | 'webhook_forwards'
    | 'function_logs';

export interface MetricUsageSummary {
    label: string;
    usage: number;
    limit: number | null;
}
