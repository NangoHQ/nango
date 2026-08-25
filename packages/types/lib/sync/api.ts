import type { ApiEndpoint, ApiError } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { ReportedSyncJobStatus } from './index.js';

export type PostPublicTrigger = ApiEndpoint<{
    Audit: AuditPolicy<'sync', 'triggered', 'environment'>;
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
