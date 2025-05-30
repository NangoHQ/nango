import type { ApiError, Endpoint } from '../api.js';

export type PostMcp = Endpoint<{
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

export type GetMcp = Endpoint<{
    Method: 'GET';
    Path: '/mcp';
    Success: Record<string, unknown>;
}>;
