export type UsageMetric = 'actions' | 'active_records';

export const metricFlags: Record<UsageMetric, string> = {
    actions: 'monthly_actions_max',
    active_records: 'monthly_active_records_max'
};
