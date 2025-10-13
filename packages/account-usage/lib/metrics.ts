import type { AccountUsageMetric } from '@nangohq/types';

export const metricFlags: Record<AccountUsageMetric, string> = {
    actions: 'monthly_actions_max',
    active_records: 'monthly_active_records_max',
    connections: 'connections_max'
};

export type UsageMetric = 'proxy' | 'connections' | 'function_executions' | 'function_compute_ms' | 'records' | 'external_webhooks' | 'logs';
export interface UsageMetricProperties {
    reset: 'monthly' | 'never';
}

export const usageMetrics: Record<UsageMetric, UsageMetricProperties> = {
    proxy: { reset: 'monthly' },
    connections: { reset: 'never' },
    function_executions: { reset: 'monthly' },
    function_compute_ms: { reset: 'monthly' },
    records: { reset: 'never' },
    external_webhooks: { reset: 'monthly' },
    logs: { reset: 'monthly' }
};
