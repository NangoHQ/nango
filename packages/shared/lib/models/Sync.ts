import type { JSONSchema7 } from 'json-schema';
import type { HTTP_VERB, Timestamps, TimestampsAndDeleted } from './Generic.js';
import type { NangoProps } from '../sdk/sync.js';
import type { NangoConfigMetadata, NangoModel, NangoSyncEndpoint, ScriptTypeLiteral } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';

export enum SyncStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR'
}

export enum SyncType {
    INITIAL = 'INITIAL',
    INCREMENTAL = 'INCREMENTAL',
    WEBHOOK = 'WEBHOOK',
    POST_CONNECTION_SCRIPT = 'POST_CONNECTION_SCRIPT',
    FULL = 'FULL',
    ACTION = 'ACTION'
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}

export type SyncResultByModel = Record<string, SyncResult>;

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
    result?: SyncResultByModel;
    sync_config_id?: number;
}

export interface ReportedSyncJobStatus {
    id?: string;
    type: SyncType;
    name?: string;
    status: SyncStatus;
    latestResult?: SyncResultByModel;
    jobStatus?: SyncStatus;
    frequency: string;
    finishedAt: Date;
    nextScheduledSyncAt: Date | null;
    latestExecutionStatus: SyncStatus;
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
    endpoints?: NangoSyncEndpoint[];
    input?: string | undefined;
    sync_type?: SyncType | undefined;
    webhook_subscriptions: string[] | null;
    enabled: boolean;
    models_json_schema?: JSONSchema7 | null;
}

export interface SyncEndpoint extends Timestamps {
    id?: number;
    sync_config_id: number;
    method: HTTP_VERB;
    path: string;
    model?: string;
}

export interface SyncDeploymentResult {
    name: string;
    version?: string;
    providerConfigKey: string;
    type: ScriptTypeLiteral;
    last_deployed?: Date;
    input?: string | SyncModelSchema | undefined;
    models: string | string[];
    id?: number | undefined;

    /** @deprecated legacy **/
    sync_name?: string;
    /** @deprecated legacy **/
    syncName?: string;
}

export interface SyncConfigResult {
    result: SyncDeploymentResult[];
    logCtx: LogContext;
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

export interface RunScriptOptions {
    syncConfig?: SyncConfig;
    syncName: string;
    syncId: string;
    activityLogId?: number | undefined;
    nangoProps: NangoProps;
    writeToDb: boolean;
    isInvokedImmediately: boolean;
    isWebhook: boolean;
    optionalLoadLocation?: string | undefined;
    input?: object | undefined;
}

export interface ScriptExecutorInterface {
    runScript(options: RunScriptOptions): Promise<any>;
}

// TODO: refactor
export interface IntegrationServiceInterface extends ScriptExecutorInterface {
    cancelScript(syncId: string, environmentId: number): Promise<void>;
}
