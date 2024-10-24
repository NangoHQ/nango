import type { ApiError, ApiTimestamps, Endpoint } from '../../api.js';
import type { Connection } from '../db.js';
import type { ActiveLog } from '../../notification/active-logs/db.js';
import type { Merge } from 'type-fest';

export type ApiConnection = Pick<Merge<Connection, ApiTimestamps>, 'id' | 'connection_id' | 'provider_config_key' | 'created_at' | 'updated_at'> & {
    provider: string;
    errors: [{ type: string; log_id: string }];
};
export type GetConnections = Endpoint<{
    Method: 'GET';
    Querystring: {
        env: string;
        integrationIds?: string[] | undefined;
        search?: string | undefined;
        withError?: boolean | undefined;
        page?: number | undefined;
    };
    Path: '/api/v1/connections';
    Success: {
        data: ApiConnection[];
    };
}>;

export type GetConnectionsCount = Endpoint<{
    Method: 'GET';
    Querystring: {
        env: string;
    };
    Path: '/api/v1/connections/count';
    Success: {
        data: { total: number; withError: number };
    };
}>;

export type GetPublicConnections = Endpoint<{
    Method: 'GET';
    Querystring: {
        env: string;
        connectionId?: string | undefined;
    };
    Path: '/connection';
    Success: {
        connections: any[];
    };
}>;

export type GetConnection = Endpoint<{
    Method: 'GET';
    Params: {
        connectionId: string;
    };
    Querystring: {
        env: string;
        provider_config_key: string;
        force_refresh?: 'true' | 'false' | undefined;
    };
    Path: '/api/v1/connections/:connectionId';
    Error:
        | ApiError<'unknown_connection'>
        | ApiError<'missing_provider_config'>
        | ApiError<'unknown_provider'>
        | ApiError<'missing_connection'>
        | ApiError<'unknown_provider_config'>;
    Success: {
        provider: string | null;
        connection: Connection;
        errorLog: ActiveLog | null;
    };
}>;

export type DeletePublicConnection = Endpoint<{
    Method: 'DELETE';
    Path: '/connection/:connectionId';
    Params: { connectionId: string };
    Querystring: { provider_config_key: string };
    Error: ApiError<'unknown_connection'> | ApiError<'unknown_provider_config'>;
    Success: { success: boolean };
}>;

export type DeleteConnection = Endpoint<{
    Method: 'DELETE';
    Path: '/api/v1/connections/:connectionId';
    Params: { connectionId: string };
    Querystring: { provider_config_key: string; env: string };
    Error: ApiError<'unknown_connection'> | ApiError<'unknown_provider_config'>;
    Success: { success: boolean };
}>;
