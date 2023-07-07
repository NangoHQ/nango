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
    created_at?: string;
    updated_at?: string;
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted?: number;
}

export interface SyncResultByModel {
    [key: string]: SyncResult;
}

export interface Sync extends Timestamps {
    id?: string;
    nango_connection_id: number;
    name: string;
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
    result?: SyncResultByModel;
    sync_config_id?: number;
}

export interface SyncModelSchema {
    name: string;
    fields: {
        name: string;
        type: string;
    }[];
}

export interface SyncConfig extends Timestamps {
    id?: number;
    environment_id: number;
    sync_name: string;
    file_location: string;
    nango_config_id: number;
    models: string[];
    model_schema: SyncModelSchema[];
    active: boolean;
    runs: string;
    version?: string;
}

export interface SlimSync {
    id?: number;
    name: string;
    sync_id?: string | null;
    providerConfigKey?: string;
    connections?: number;
}

export type SyncDeploymentResult = Pick<SyncConfig, 'id' | 'version' | 'sync_name'>;

export interface SyncDifferences {
    newSyncs: SlimSync[];
    deletedSyncs: SlimSync[];
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

export interface NangoSyncWebhookBody {
    connectionId: string;
    providerConfigKey: string;
    syncName: string;
    model: string;
    responseResults: SyncResult;
    syncType: SyncType;
    queryTimeStamp: string;
}

export interface SyncConfigWithProvider {
    id: number;
    sync_name: string;
    runs: string;
    models: string[];
    updated_at: string;
    provider_config_key: string;
    unique_key: string;
}
