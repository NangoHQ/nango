import type { UsageMetric } from '@nangohq/types';

// Render order for the usage panels. `data_transfer` is omitted — it has no Free cap and no
// dollar-charges framing yet (that's NAN-6220).
export const USAGE_METRICS: UsageMetric[] = [
    'connections',
    'proxy',
    'function_compute_gbms',
    'function_executions',
    'function_logs',
    'records',
    'webhook_forwards'
];

// Primary labels, kept accurate to the underlying values (not the design's shorthand, which renames
// e.g. compute to "Compute hours" without converting units).
export const USAGE_METRIC_LABELS: Record<UsageMetric, string> = {
    connections: 'Connections',
    proxy: 'Proxy requests',
    function_compute_gbms: 'Function compute time',
    function_executions: 'Function runs',
    function_logs: 'Function logs',
    records: 'Sync records',
    webhook_forwards: 'Webhook forwarding',
    data_transfer: 'Data transfer'
};
