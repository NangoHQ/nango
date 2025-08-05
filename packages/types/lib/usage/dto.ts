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

export interface MetricUsage {
    metric: string;
    label: string;
    usage: number;
    limit: number | null;
}
