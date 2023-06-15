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
    futureActionTimes?: {
        seconds?: number;
        nanos?: number;
    };
}

export interface Job extends Timestamps {
    id?: number;
    status: SyncStatus;
    type: SyncType;
    sync_id: string;
    job_id: string;
    activity_log_id: number | null;
    result?: SyncResult;
    sync_config_id?: number;
}

interface SyncModelSchema {
    name: string;
    fields: {
        name: string;
        type: string;
    }[];
}

export interface SyncConfig extends Timestamps {
    id?: number;
    account_id: number;
    sync_name: string;
    file_location: string;
    nango_config_id: number;
    models: string[];
    model_schema: SyncModelSchema[];
    active: boolean;
    runs: string;
    version?: string;
    sync_id?: string;
}

export interface IncomingSyncConfig {
    syncName: string;
    providerConfigKey: string;
    fileBody: string;
    models: string[];
    runs: string;
    version?: string;
    model_schema: SyncModelSchema[];
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
    [index: string]: number | string | Date | object | undefined;
    id?: string;
    external_id: string;
    json: object;
    data_hash: string;
    nango_connection_id: number;
    model: string;
    sync_id: string;
    sync_config_id?: number | undefined;
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

export interface SyncWebhookBody {
    connectionId: string;
    providerConfigKey: string;
    syncName: string;
    model: string;
    responseResults: SyncResult;
    syncType: SyncType;
    queryTimeStamp: string;
}
