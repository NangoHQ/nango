export type AccountUsageIncrementableMetric = 'actions' | 'active_records';

export type AccountUsageMetric = AccountUsageIncrementableMetric | 'connections';

export const metricFlags: Record<AccountUsageMetric, string> = {
    actions: 'monthly_actions_max',
    active_records: 'monthly_active_records_max',
    connections: 'connections_max'
};
