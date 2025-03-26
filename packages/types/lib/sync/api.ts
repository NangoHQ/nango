import type { ApiError, Endpoint } from '../api.js';

export type PostTrigger = Endpoint<{
    Method: 'POST';
    Path: '/sync/trigger';
    Body: {
        syncs: (string | { name: string; variant: string })[];
        full_resync: boolean;
        provider_config_key?: string;
        connection_id?: string;
    };
    Headers: {
        'Provider-Config-Key'?: string;
        'Connection-Id'?: string;
    };
    Success: { success: boolean };
    Error: ApiError<'invalid_query_params' | 'invalid_body' | 'invalid_sync' | 'invalid_headers' | 'missing_provider_config_key' | 'missing_connection_id'>;
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
