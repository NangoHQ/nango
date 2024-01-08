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
    FULL = 'FULL',
    ACTION = 'ACTION'
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
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

export interface Action extends TimestampsAndDeleted {
    name: string;
}

export interface Job extends TimestampsAndDeleted {
    id?: number;
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
    name?: string;
    status: SyncStatus;
    latestResult?: SyncResultByModel;
    jobStatus?: SyncStatus;
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
    pre_built?: boolean;
    is_public?: boolean;
    endpoints?: NangoSyncEndpoint[];
    input?: string;
    sync_type?: SyncType | undefined;
    webhook_subscriptions?: string[];
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
}

export interface SlimAction {
    id?: number;
    providerConfigKey?: string;
    name: string;
}

export interface SyncDeploymentResult {
    name: string;
    version: string;
    providerConfigKey: string;
    type: SyncConfigType;

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
    input?: string;
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

export type CustomerFacingDataRecord = {
    _nango_metadata: RecordMetadata;
} & Record<string, any> & { id: string | number };

export type GetRecordsResponse = { records: CustomerFacingDataRecord[] | DataRecordWithMetadata[]; next_cursor?: string | null } | null;

export type RecordWrapCustomerFacingDataRecord = { record: CustomerFacingDataRecord }[];

export interface DataRecord extends Timestamps {
    [index: string]: number | string | Date | object | undefined | boolean | null;
    id?: string;
    external_id: string;
    json: object;
    record?: object;
    data_hash: string;
    nango_connection_id: number;
    model: string;
    sync_id: string;
    sync_config_id?: number | undefined;
    external_is_deleted?: boolean;
    external_deleted_at?: Date | null;
    json_iv?: string | null;
    json_tag?: string | null;
    pending_delete?: boolean;
}

export type LastAction = 'added' | 'updated' | 'deleted';

interface RecordMetadata {
    first_seen_at: Date;
    last_modified_at: Date;
    last_action: LastAction;
    deleted_at: Date | null;
}

export interface DataRecordWithMetadata extends RecordMetadata {
    record: object;
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
    from: string;
    connectionId: string;
    providerConfigKey: string;
    syncName: string;
    model: string;
    responseResults: SyncResult;
    syncType: SyncType;
    queryTimeStamp: string | null;
}

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

export interface IntegrationServiceInterface {
    runScript(
        syncName: string,
        syncId: string,
        activityLogId: number | undefined,
        nangoProps: NangoProps,
        integrationData: NangoIntegrationData,
        environmentId: number,
        writeToDb: boolean,
        isInvokedImmediately: boolean,
        isWebhook: boolean,
        optionalLoadLocation?: string,
        input?: object,
        temporalContext?: Context
    ): Promise<any>;
}
