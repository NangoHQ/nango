export type AccountUsageMetric = 'actions' | 'active_records';

export const metricFlags: Record<AccountUsageMetric, string> = {
    actions: 'monthly_actions_max',
    active_records: 'monthly_active_records_max'
};
