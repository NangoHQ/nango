import type { DBAccountUsage } from './db.js';

export interface CreateAccountUsageDto {
    accountId: DBAccountUsage['account_id'];
    month: DBAccountUsage['month'];
    actions?: DBAccountUsage['actions'];
    activeRecords?: DBAccountUsage['active_records'];
}

export interface UpdateAccountUsageDto {
    actions?: DBAccountUsage['actions'];
    activeRecords?: DBAccountUsage['active_records'];
}

export type AccountUsageIncrementableMetric = 'actions' | 'active_records';

export type AccountUsageMetric = AccountUsageIncrementableMetric | 'connections';

export type AccountMetricsUsageSummary = Record<AccountUsageMetric, MetricUsageSummary>;

export interface MetricUsageSummary {
    label: string;
    usage: number;
    limit: number | null;
}
