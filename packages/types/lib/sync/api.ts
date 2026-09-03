import type { ApiEndpoint, ApiError } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { SyncTypeLiteral } from '../nangoYaml/index.js';
import type { ReportedSyncJobStatus, SyncJobsType, SyncResultByModel, SyncStatus } from './index.js';

export interface ApiConnectionSyncJob {
    /** `_nango_sync_jobs.id` is a bigint, so it is carried as a string rather than rounded into a number. */
    job_id: string;
    created_at: string;
    updated_at: string;
    /** @deprecated **/
    type: SyncJobsType | 'INITIAL';
    status: SyncStatus;
    result: SyncResultByModel | null;
    sync_config_id: number;
    version: string;
    models: string[];
}

export interface ApiConnectionSync {
    id: string;
    name: string;
    variant: string;
    nango_connection_id: number;
    sync_type: SyncTypeLiteral;
    models: string[];
    /** The per-sync override when set, otherwise the sync config's `runs`. */
    frequency: string | null;
    frequency_override: string | null;
    /** null when the orchestrator has no schedule for the sync, or could not be reached. */
    schedule_status: 'STARTED' | 'PAUSED' | 'DELETED' | null;
    status: SyncStatus;
    /** Unix seconds. */
    futureActionTimes: number[];
    latest_sync: ApiConnectionSyncJob | null;
    active_logs: { log_id: string } | null;
    /** Keyed by bare model name; null when the record store could not be reached. */
    record_count: Record<string, number> | null;
}

export type GetConnectionSyncs = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/connections/:connectionId/syncs';
    Params: { connectionId: string };
    Querystring: {
        env: string;
        provider_config_key: string;
        name?: string | undefined;
        variant?: string | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    };
    Success: {
        data: ApiConnectionSync[];
        pagination: { total: number; page: number; limit: number };
    };
}>;

export type PostPublicTrigger = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'data-plane operation' };
    Method: 'POST';
    Path: '/sync/trigger';
    Body: {
        syncs: (string | { name: string; variant: string })[];
        provider_config_key?: string | undefined;
        connection_id?: string | undefined;
        opts?: { reset?: boolean | undefined; emptyCache?: boolean | undefined } | undefined;
        // @deprecated in favor of opts.reset
        full_resync?: boolean | undefined;
        // @deprecated in favor of opts
        sync_mode?: 'incremental' | 'full_refresh' | 'full_refresh_and_clear_cache' | undefined;
    };
    Headers: {
        'provider-config-key'?: string | undefined;
        'connection-id'?: string | undefined;
    };
    Success: { success: boolean };
    Error: ApiError<'missing_provider_config_key' | 'unknown_provider_config' | 'unknown_connection' | 'no_syncs_found'>;
}>;

export type PostSyncVariant = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'variant_created', 'environment'>;
    Method: 'POST';
    Path: '/sync/:name/variant/:variant';
    Body: {
        provider_config_key: string;
        connection_id: string;
    };
    Params: {
        name: string;
        variant: string;
    };
    Error: ApiError<
        'invalid_variant' | 'unknown_connection' | 'unknown_provider_config' | 'unknown_sync' | 'sync_variant_already_exists' | 'failed_sync_variant_creation'
    >;
    Success: { id: string; name: string; variant: string };
}>;

export type DeleteSyncVariant = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'variant_deleted', 'environment'>;
    Method: 'DELETE';
    Path: '/sync/:name/variant/:variant';
    Body: {
        provider_config_key: string;
        connection_id: string;
    };
    Params: {
        name: string;
        variant: string;
    };
    Error: ApiError<'invalid_variant' | 'unknown_connection' | 'failed_sync_variant_deletion'>;
    Success: { success: boolean };
}>;

export type PutPublicSyncConnectionFrequency = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'frequency_changed', 'environment'>;
    Method: 'PUT';
    Path: '/sync/update-connection-frequency';
    Body: {
        sync_name: string;
        sync_variant?: string | undefined;
        provider_config_key: string;
        connection_id: string;
        frequency: string | null;
    };
    Success: { frequency: string };
    Error: ApiError<'unknown_connection' | 'unknown_sync'>;
}>;

export type PostPublicSyncPause = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'paused', 'environment'>;
    Method: 'POST';
    Path: '/sync/pause';
    Body: {
        syncs: (string | { name: string; variant: string })[];
        provider_config_key: string;
        connection_id?: string | undefined;
    };
    Success: { success: boolean };
    Error: ApiError<'no_syncs_found' | 'unknown_connection' | 'unknown_provider_config'>;
}>;

export type PostPublicSyncStart = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'started', 'environment'>;
    Method: 'POST';
    Path: '/sync/start';
    Body: {
        syncs: (string | { name: string; variant: string })[];
        provider_config_key: string;
        connection_id?: string | undefined;
    };
    Success: { success: boolean };
    Error: ApiError<'no_syncs_found' | 'unknown_connection' | 'unknown_provider_config'>;
}>;

export type GetPublicSyncStatus = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/sync/status';
    Querystring: {
        syncs: string;
        provider_config_key: string;
        connection_id?: string | undefined;
    };
    Success: { syncs: ReportedSyncJobStatus[] };
}>;
