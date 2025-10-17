import type { AccountUsageMetric } from '@nangohq/types';

export const metricFlags: Record<AccountUsageMetric, string> = {
    actions: 'monthly_actions_max',
    active_records: 'monthly_active_records_max',
    connections: 'connections_max'
};

export type UsageMetric = 'proxy' | 'connections' | 'function_executions' | 'function_compute_gbms' | 'records' | 'external_webhooks' | 'function_logs';
export interface UsageMetricProperties {
    reset: 'monthly' | 'never';
}

export const usageMetrics: Record<UsageMetric, UsageMetricProperties> = {
    proxy: { reset: 'monthly' },
    connections: { reset: 'never' },
    function_executions: { reset: 'monthly' },
    function_compute_gbms: { reset: 'monthly' }, // Gigabyte/ms
    records: { reset: 'never' },
    external_webhooks: { reset: 'monthly' },
    function_logs: { reset: 'monthly' }
};
