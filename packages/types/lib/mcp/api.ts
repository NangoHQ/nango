import type { ApiError, Endpoint } from '../api.js';

export type PostConnectionToolsMcp = Endpoint<{
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

export type GetConnectionToolsMcp = Endpoint<{
    Method: 'GET';
    Path: '/mcp';
    Success: Record<string, unknown>;
}>;

export type PostControlPlaneMcp = Endpoint<{
    Method: 'POST';
    Path: '/mcp';
    Body: Record<string, unknown>;
    Success: Record<string, unknown>;
}>;

export type GetControlPlaneMcp = Endpoint<{
    Method: 'GET';
    Path: '/mcp';
    Success: Record<string, unknown>;
}>;
