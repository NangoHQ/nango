import type { Context } from '@temporalio/activity';
import { LogActionEnum } from './Activity.js';
import type { HTTP_VERB, Timestamps, TimestampsAndDeleted } from './Generic.js';
import type { NangoProps } from '../sdk/sync.js';
import type { NangoIntegrationData, NangoSyncEndpoint } from './NangoConfig.js';

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
}

export interface SyncModelSchema {
    name: string;
    fields: {
        name: string;
        type: string;
    }[];
}

export enum SyncConfigType {
    SYNC = 'sync',
    ACTION = 'action'
}

export interface NangoConfigMetadata {
    scopes?: string[];
    description?: string;
}

export interface SyncConfig extends TimestampsAndDeleted {
    id?: number;
    environment_id: number;
    sync_name: string;
    type: SyncConfigType;
    file_location: string;
    nango_config_id: number;
    models: string[];
    model_schema: SyncModelSchema[];
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
    input?: string | SyncModelSchema | undefined;
    sync_type?: SyncType | undefined;
    webhook_subscriptions: string[] | null;
    enabled: boolean;
}

export interface SyncEndpoint extends Timestamps {
    id?: number;
    sync_config_id: number;
    method: HTTP_VERB;
    path: string;
    model?: string;
}

export interface SlimSync {
    id?: number;
    name: string;
    auto_start?: boolean;
    sync_id?: string | null;
    providerConfigKey?: string;
    connections?: number;
    enabled?: boolean;
}

export interface SlimAction {
    id?: number;
    providerConfigKey?: string;
    name: string;
}

export interface SyncDeploymentResult {
    name: string;
    version?: string;
    providerConfigKey: string;
    type: SyncConfigType;
    last_deployed?: Date;
    input?: string | SyncModelSchema;
    models: string | string[];
    id?: number | undefined;

    // legacy
    sync_name?: string;
    syncName?: string;
}

export interface SyncConfigResult {
    result: SyncDeploymentResult[];
    activityLogId: number | null;
}

export interface SyncAndActionDifferences {
    newSyncs: SlimSync[];
    deletedSyncs: SlimSync[];
    newActions: SlimAction[];
    deletedActions: SlimAction[];
}

interface InternalIncomingPreBuiltFlowConfig {
    type: SyncConfigType;
    models: string[];
    runs: string;
    auto_start?: boolean;
    attributes?: object;
    metadata?: NangoConfigMetadata;
    model_schema: string;
    input?: string | SyncModelSchema;
    endpoints?: NangoSyncEndpoint[];
}

export interface IncomingPreBuiltFlowConfig extends InternalIncomingPreBuiltFlowConfig {
    provider: string;
    is_public: boolean;
    public_route?: string;
    name: string;
    syncName?: string; // legacy
    nango_config_id?: number;

    providerConfigKey?: string;
    fileBody?: {
        js: string;
        ts: string;
    };
}

export interface IncomingFlowConfig extends InternalIncomingPreBuiltFlowConfig {
    syncName: string;
    providerConfigKey: string;
    fileBody?: {
        js: string;
        ts: string;
    };
    version?: string;
    track_deletes?: boolean;
    sync_type?: SyncType;
    webhookSubscriptions?: string[];
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

export type SyncWithSchedule = Sync & Schedule;

export enum SyncCommand {
    PAUSE = 'PAUSE',
    UNPAUSE = 'UNPAUSE',
    RUN = 'RUN',
    RUN_FULL = 'RUN_FULL',
    CANCEL = 'CANCEL'
}

export const CommandToActivityLog = {
    PAUSE: LogActionEnum.PAUSE_SYNC,
    UNPAUSE: LogActionEnum.RESTART_SYNC,
    RUN: LogActionEnum.TRIGGER_SYNC,
    RUN_FULL: LogActionEnum.TRIGGER_FULL_SYNC,
    CANCEL: LogActionEnum.CANCEL_SYNC
};

export const SyncCommandToScheduleStatus = {
    PAUSE: ScheduleStatus.PAUSED,
    UNPAUSE: ScheduleStatus.RUNNING,
    RUN: ScheduleStatus.RUNNING,
    RUN_FULL: ScheduleStatus.RUNNING,
    CANCEL: ScheduleStatus.RUNNING
};

export interface SyncConfigWithProvider {
    id: number;
    sync_name: string;
    runs: string;
    models: string[];
    updated_at: string;
    provider_config_key: string;
    unique_key: string;
    type: SyncConfigType;
}

export interface RunScriptOptions {
    syncName: string;
    syncId: string;
    activityLogId: number | undefined;
    nangoProps: NangoProps;
    integrationData: NangoIntegrationData;
    environmentId: number;
    writeToDb: boolean;
    isInvokedImmediately: boolean;
    isWebhook: boolean;
    optionalLoadLocation?: string | undefined;
    input?: object | undefined;
    temporalContext?: Context | undefined;
}
export interface IntegrationServiceInterface {
    runScript(options: RunScriptOptions): Promise<any>;
    cancelScript(syncId: string, environmentId: number): Promise<void>;
}
