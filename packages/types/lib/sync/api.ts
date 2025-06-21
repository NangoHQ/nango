import type { ApiError, Endpoint } from '../api.js';

export type PostPublicTrigger = Endpoint<{
    Method: 'POST';
    Path: '/sync/trigger';
    Body: {
        syncs: (string | { name: string; variant: string })[];
        sync_mode?: 'incremental' | 'full_refresh' | 'full_refresh_and_clear_cache' | undefined;
        provider_config_key?: string | undefined;
        connection_id?: string | undefined;
        // @deprecrated in favor of sync_mode
        full_resync?: boolean | undefined;
    };
    Headers: {
        'provider-config-key'?: string | undefined;
        'connection-id'?: string | undefined;
    };
    Success: { success: boolean };
    Error: ApiError<'missing_provider_config_key'>;
}>;

export type PostSyncVariant = Endpoint<{
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

export type UpdateConnectionFrequency = Endpoint<{
    Method: 'PUT';
    Path: '/api/v1/sync/update-connection-frequency';
    Querystring: { env: string };
    Body: {
        connection_id: string;
        provider_config_key: string;
        name: string;
        variant: string;
        frequency: string | null;
    };
    Error: ApiError<'unknown_provider_config'> | ApiError<'unknown_connection'>;
    Success: { data: { frequency: string } };
}>;

export type DeleteSyncVariant = Endpoint<{
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

export type PutPublicSyncConnectionFrequency = Endpoint<{
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
