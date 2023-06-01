export enum SyncStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED',
    SUCCESS = 'SUCCESS'
}

export enum SyncType {
    INITIAL = 'INITIAL',
    INCREMENTAL = 'INCREMENTAL'
}

interface Timestamps {
    created_at?: Date;
    updated_at?: Date;
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted?: number;
}

export interface Sync extends Timestamps {
    id?: string;
    nango_connection_id: number;
    name: string;
    models: string[];
}

export interface Job extends Timestamps {
    id?: number;
    status: SyncStatus;
    type: SyncType;
    sync_id: string;
    job_id: string;
    activity_log_id: number | null;
    result?: SyncResult;
}

export interface SyncConfig {
    id?: number;
    account_id: number;
    provider: string;
    integration_name: string;
    snippet: string;
}

export interface GetRecordsRequestConfig {
    providerConfigKey: string;
    connectionId: string;
    model: string;
    delta?: string;
    offset?: number;
    limit?: number;
}

export enum ScheduleStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED'
}

export interface Schedule extends Timestamps {
    id?: string;
    schedule_id: string;
    status: ScheduleStatus;
    sync_id: string;
    sync_job_id: number;
    frequency: string;
}

export interface DataRecord extends Timestamps {
    id?: string;
    external_id: string;
    json: object;
    data_hash: string;
    nango_connection_id: number;
    model: string;
    sync_id: string;
}

export type SyncWithSchedule = Sync & Schedule;

export enum SyncCommand {
    PAUSE = 'PAUSE',
    UNPAUSE = 'UNPAUSE',
    RUN = 'RUN',
    RUN_FULL = 'RUN_FULL'
}

export const SyncCommandToScheduleStatus = {
    PAUSE: ScheduleStatus.PAUSED,
    UNPAUSE: ScheduleStatus.RUNNING,
    RUN: ScheduleStatus.RUNNING,
    RUN_FULL: ScheduleStatus.RUNNING
};
