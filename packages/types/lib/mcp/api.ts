import type { ApiEndpoint, ApiError } from '../api.js';

export type PostConnectionToolsMcp = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/mcp';
    Body: Record<string, unknown>;
    Headers: {
        'connection-id': string;
        'provider-config-key': string;
    };
    Success: Record<string, unknown>;
    Error: ApiError<'missing_connection_id' | 'unknown_connection'>;
}>;

export type GetConnectionToolsMcp = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/mcp';
    Success: Record<string, unknown>;
}>;

export type PostManagementMcp = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'audited-per-tool' };
    Method: 'POST';
    Path: '/mcp';
    Body: Record<string, unknown>;
    Success: Record<string, unknown>;
}>;

export type GetManagementMcp = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/mcp';
    Success: Record<string, unknown>;
}>;
