export type SyncStatus = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'SUCCESS' | 'ERROR';

export type SyncJobsType = 'INCREMENTAL' | 'FULL' | 'WEBHOOK' | 'ON_EVENT_SCRIPT' | 'ACTION';

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}

export type SyncResultByModel = Record<string, SyncResult>;

export interface ReportedSyncJobStatus {
    id?: string;
    type: SyncJobsType | 'INITIAL';
    name?: string;
    variant?: string;
    connection_id?: string;
    status: SyncStatus;
    latestResult?: SyncResultByModel | undefined;
    jobStatus?: SyncStatus;
    frequency: string | null;
    finishedAt: Date | undefined;
    nextScheduledSyncAt: Date | null;
    latestExecutionStatus: SyncStatus | undefined;
    recordCount: Record<string, number>;
}
