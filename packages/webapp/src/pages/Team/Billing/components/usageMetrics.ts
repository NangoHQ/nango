import type { UsageMetric } from '@nangohq/types';

// The label carries a unit only where the figure doesn't: the retired compute metric is a bare
// millisecond total, so "1.05M" alone says nothing, while hours and GB figures name their own.
export const USAGE_METRIC_LABELS: Record<UsageMetric, string> = {
    connections: 'Connections',
    proxy: 'Proxy requests',
    function_compute_gbms: 'Function compute time (ms)',
    function_duration_seconds: 'Compute time',
    function_executions: 'Function runs',
    function_logs: 'Function logs',
    records: 'Sync records',
    webhook_forwards: 'Webhook forwarding',
    data_transfer: 'Data transfer'
};
