import { LogActionEnum } from './Activity.js';
import type { Timestamps, TimestampsAndDeleted } from './Generic.js';

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

export interface SyncResult {
    added: number;
    updated: number;
    deleted?: number;
}

export interface SyncResultByModel {
    [key: string]: SyncResult;
}

export interface Sync extends TimestampsAndDeleted {
    id?: string;
    nango_connection_id: number;
    name: string;
    last_sync_date?: Date | null;
    futureActionTimes?: {
        seconds?: number;
        nanos?: number;
    };
}

export interface Job extends TimestampsAndDeleted {
    id?: number;
    status: SyncStatus;
    type: SyncType;
    sync_id: string;
    job_id: string;
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

export interface SyncConfig extends TimestampsAndDeleted {
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

export interface SyncConfigResult {
    result: SyncDeploymentResult[];
    activityLogId: number | null;
}

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
    model_schema: string;
}

export enum ScheduleStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED'
}

export interface Schedule extends TimestampsAndDeleted {
    id?: string;
    schedule_id: string;
    status: ScheduleStatus;
    sync_id: string;
    sync_job_id: number;
    frequency: string;
    offset: number;
}

export interface DataRecord extends Timestamps {
    [index: string]: number | string | Date | object | undefined | boolean | null;
    id?: string;
    external_id: string;
    json: object;
    data_hash: string;
    nango_connection_id: number;
    model: string;
    sync_id: string;
    sync_config_id?: number | undefined;
    external_is_deleted?: boolean;
    external_deleted_at?: Date | null;
}

export type SyncWithSchedule = Sync & Schedule;

export enum SyncCommand {
    PAUSE = 'PAUSE',
    UNPAUSE = 'UNPAUSE',
    RUN = 'RUN',
    RUN_FULL = 'RUN_FULL'
}

export const CommandToActivityLog = {
    PAUSE: LogActionEnum.PAUSE_SYNC,
    UNPAUSE: LogActionEnum.RESTART_SYNC,
    RUN: LogActionEnum.TRIGGER_SYNC,
    RUN_FULL: LogActionEnum.FULL_SYNC
};

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
