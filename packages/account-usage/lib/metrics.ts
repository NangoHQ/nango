import type { UsageMetric } from '@nangohq/types';

export interface UsageMetricProperties {
    reset: 'monthly' | 'never';
}

export const usageMetrics: Record<UsageMetric, UsageMetricProperties> = {
    proxy: { reset: 'monthly' },
    connections: { reset: 'never' },
    function_executions: { reset: 'monthly' },
    function_compute_gbms: { reset: 'monthly' }, // Gigabyte/ms
    records: { reset: 'never' },
    webhook_forwards: { reset: 'monthly' },
    function_logs: { reset: 'monthly' }
};
