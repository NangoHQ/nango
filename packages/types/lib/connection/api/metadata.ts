import type { ApiEndpoint, ApiError } from '../../api.js';
import type { AuditPolicy } from '../../audit-trail/event.js';
import type { Metadata } from '../db.js';

export interface MetadataBody {
    connection_id: string | string[];
    provider_config_key: string;
    metadata: Metadata;
}

type MetadataError = ApiError<'invalid_body'> | ApiError<'unknown_connection'>;

export type SetMetadata = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'data-plane operation' };
    Method: 'POST';
    Body: MetadataBody;
    Path: '/connection/metadata';
    Error: MetadataError;
    Success: MetadataBody;
}>;

export type UpdateMetadata = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'data-plane operation' };
    Method: 'PATCH';
    Path: '/connection/metadata';
    Body: MetadataBody;
    Error: MetadataError;
    Success: MetadataBody;
}>;

export type PostConnectionMetadata = ApiEndpoint<{
    Audit: AuditPolicy<'connection', 'metadata_updated', 'environment'>;
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
