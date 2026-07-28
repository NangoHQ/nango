import type { ApiEndpoint, ApiError } from '../../api.js';
import type { auditPolicies } from '../../audit-trail/event.js';
import type { Metadata } from '../db.js';

export interface MetadataBody {
    connection_id: string | string[];
    provider_config_key: string;
    metadata: Metadata;
}

type MetadataError = ApiError<'invalid_body'> | ApiError<'unknown_connection'>;

export type SetMetadata = ApiEndpoint<{
    Audit: typeof auditPolicies.connectionMetadataUpdated;
    Method: 'POST';
    Body: MetadataBody;
    Path: '/connection/metadata';
    Error: MetadataError;
    Success: MetadataBody;
}>;

export type UpdateMetadata = ApiEndpoint<{
    Audit: typeof auditPolicies.connectionMetadataUpdated;
    Method: 'PATCH';
    Path: '/connection/metadata';
    Body: MetadataBody;
    Error: MetadataError;
    Success: MetadataBody;
}>;

export type PostConnectionMetadata = ApiEndpoint<{
    Audit: typeof auditPolicies.connectionMetadataUpdated;
    Method: 'POST';
    Path: '/api/v1/connections/:connectionId/metadata';
    Params: {
        connectionId: string;
    };
    Querystring: {
        env: string;
        provider_config_key: string;
    };
    Body: {
        metadata: Metadata;
    };
    Success: { success: boolean };
    Error: ApiError<'unknown_provider_config' | 'not_found' | 'invalid_body'>;
}>;
