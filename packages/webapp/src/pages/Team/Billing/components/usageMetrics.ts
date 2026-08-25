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
// e.g. compute to "Compute hours" without converting units). Where a figure isn't a count of the
// thing the row is named after, the label carries its unit — compute is a raw millisecond total, so
// "1.05M" alone says nothing. The server's own label for it does the same ("Function time (ms)").
export const USAGE_METRIC_LABELS: Record<UsageMetric, string> = {
    connections: 'Connections',
    proxy: 'Proxy requests',
    function_compute_gbms: 'Function compute time (ms)',
    function_duration_seconds: 'Function compute time (s)',
    function_executions: 'Function runs',
    function_logs: 'Function logs',
    records: 'Sync records',
    webhook_forwards: 'Webhook forwarding',
    data_transfer: 'Data transfer'
};
