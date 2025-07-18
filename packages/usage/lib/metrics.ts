export type UsageMetric = 'actions' | 'activeRecords';

export const metricFlags: Record<UsageMetric, string> = {
    actions: 'monthly_actions_max',
    activeRecords: 'monthly_active_records_max'
};
