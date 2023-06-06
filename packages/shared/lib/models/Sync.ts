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

export interface SyncConfig extends Timestamps {
    id?: number;
    account_id: number;
    sync_name: string;
    file_location: string;
    nanog_config_id: number;
    models: string[];
    active: boolean;
    runs: string;
    version?: string;
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
    offset: number;
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

export interface IncomingSyncConfig {
    syncName: string;
    providerConfigKey: string;
    fileBody: string;
    models: string[];
    runs: string;
    version?: string;
}
