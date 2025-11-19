import type { ApiBillingUsageMetric, ApiBillingUsageMetrics, BillingUsageMetric, BillingUsageMetrics, UsageMetric } from '@nangohq/types';

const labelMap: Record<UsageMetric, string> = {
    proxy: 'Proxy requests',
    connections: 'Connections',
    function_executions: 'Function runs',
    function_compute_gbms: 'Function time (ms)',
    function_logs: 'Function logs',
    records: 'Sync records',
    webhook_forwards: 'Webhook forwarding'
};

export function getMetricLabel(metric: UsageMetric): string {
    return labelMap[metric];
}

export function toApiBillingUsageMetric(usageMetric: BillingUsageMetric | undefined, metricName: UsageMetric): ApiBillingUsageMetric {
    if (!usageMetric) {
        return {
            externalId: '',
            label: getMetricLabel(metricName),
            total: 0,
            usage: [],
            view_mode: 'periodic'
        };
    }

    return {
        ...usageMetric,
        label: getMetricLabel(metricName)
    };
}

export function toApiBillingUsageMetrics(usageMetrics: BillingUsageMetrics): ApiBillingUsageMetrics {
    return {
        connections: toApiBillingUsageMetric(usageMetrics.connections, 'connections'),
        proxy: toApiBillingUsageMetric(usageMetrics.proxy, 'proxy'),
        function_compute_gbms: toApiBillingUsageMetric(usageMetrics.function_compute_gbms, 'function_compute_gbms'),
        function_executions: toApiBillingUsageMetric(usageMetrics.function_executions, 'function_executions'),
        function_logs: toApiBillingUsageMetric(usageMetrics.function_logs, 'function_logs'),
        records: toApiBillingUsageMetric(usageMetrics.records, 'records'),
        webhook_forwards: toApiBillingUsageMetric(usageMetrics.webhook_forwards, 'webhook_forwards')
    };
}
