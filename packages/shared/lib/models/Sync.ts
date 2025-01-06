import type { JSONSchema7 } from 'json-schema';
import type { TimestampsAndDeleted } from './Generic.js';
import type { NangoConfigMetadata, NangoModel, NangoSyncEndpointV2, ScriptTypeLiteral } from '@nangohq/types';

export enum SyncStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR'
}

export enum SyncType {
    INCREMENTAL = 'INCREMENTAL',
    FULL = 'FULL',
    WEBHOOK = 'WEBHOOK',
    ON_EVENT_SCRIPT = 'ON_EVENT_SCRIPT',
    ACTION = 'ACTION'
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}

export type SyncResultByModel = Record<string, SyncResult>;

export type SyncWithConnectionId = Sync & { connection_id: string };

export interface Sync extends TimestampsAndDeleted {
    id: string;
    nango_connection_id: number;
    name: string;
    last_sync_date: Date | null;
    futureActionTimes?: {
        seconds?: number;
        nanos?: number;
    };
    frequency: string | null;
    last_fetched_at: Date | null;
    sync_config_id: number;
}

export interface Action extends TimestampsAndDeleted {
    name: string;
}

export interface Job extends TimestampsAndDeleted {
    id: number;
    status: SyncStatus;
    type: SyncType;
    sync_id: string;
    job_id: string;
    run_id?: string | null;
    log_id?: string | null;
    result?: SyncResultByModel;
    sync_config_id?: number;
}

export interface ReportedSyncJobStatus {
    id?: string;
    type: SyncType | 'INITIAL';
    name?: string;
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

// TODO: change that to use Parsed type
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
    type: ScriptTypeLiteral;
    file_location: string;
    nango_config_id: number;
    models: string[];
    model_schema: SyncModelSchema[] | NangoModel[];
    active: boolean;
    runs: string;
    track_deletes: boolean;
    auto_start: boolean;
    attributes?: object;
    metadata?: NangoConfigMetadata;
    version?: string;
    pre_built?: boolean | null;
    is_public?: boolean | null;
    endpoints?: NangoSyncEndpointV2[];
    input?: string | undefined;
    sync_type?: SyncType | undefined;
    webhook_subscriptions: string[] | null;
    enabled: boolean;
    models_json_schema?: JSONSchema7 | null;
}

export enum SyncCommand {
    PAUSE = 'PAUSE',
    UNPAUSE = 'UNPAUSE',
    RUN = 'RUN',
    RUN_FULL = 'RUN_FULL',
    CANCEL = 'CANCEL'
}

export interface SyncConfigWithProvider {
    id: number;
    sync_name: string;
    runs: string;
    models: string[];
    updated_at: string;
    provider_config_key: string;
    unique_key: string;
    type: ScriptTypeLiteral;
}
