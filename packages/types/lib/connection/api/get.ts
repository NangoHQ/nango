import type { ApiError, ApiTimestamps, Endpoint } from '../../api.js';
import type {
    AllAuthCredentials,
    ApiKeyCredentials,
    BasicApiCredentials,
    OAuth1Credentials,
    OAuth2ClientCredentials,
    OAuth2Credentials,
    TbaCredentials
} from '../../auth/api.js';
import type { EndUserInput } from '../../connect/api.js';
import type { ApiEndUser } from '../../endUser/index.js';
import type { ActiveLog } from '../../notification/active-logs/db.js';
import type { ReplaceInObject } from '../../utils.js';
import type { ConnectionConfig, DBConnection, DBConnectionDecrypted } from '../db.js';
import type { Merge } from 'type-fest';

export type ApiConnectionSimple = Pick<Merge<DBConnection, ApiTimestamps>, 'id' | 'connection_id' | 'provider_config_key' | 'created_at' | 'updated_at'> & {
    provider: string;
    errors: { type: string; log_id: string }[];
    endUser: ApiEndUser | null;
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
        data: ApiConnectionSimple[];
    };
}>;

export type GetConnectionsCount = Endpoint<{
    Method: 'GET';
    Querystring: {
        env: string;
    };
    Path: '/api/v1/connections/count';
    Success: {
        data: { total: number; withAuthError: number; withSyncError: number; withError: number };
    };
}>;

export type ApiPublicConnection = Pick<DBConnection, 'id' | 'connection_id'> & {
    provider_config_key: string; // original prop in DB, is marked as deprecated but not for the API
    created: string;
    metadata: Record<string, unknown> | null;
    provider: string;
    errors: { type: string; log_id: string }[];
    end_user: ApiEndUser | null;
};
export type GetPublicConnections = Endpoint<{
    Method: 'GET';
    Querystring: {
        connectionId?: string | undefined;
        search?: string | undefined;
        endUserId?: string | undefined;
        endUserOrganizationId?: string | undefined;
    };
    Path: '/connection';
    Success: {
        connections: ApiPublicConnection[];
    };
}>;

export type PostPublicConnection = Endpoint<{
    Method: 'POST';
    Path: '/connections';
    Body: {
        connection_id?: string | undefined;
        provider_config_key: string;
        metadata?: Record<string, unknown> | undefined;
        connection_config?: ConnectionConfig | undefined;
        credentials:
            | Omit<OAuth2Credentials, 'raw'>
            | Omit<OAuth2ClientCredentials, 'raw'>
            | Omit<OAuth1Credentials, 'raw'>
            | Omit<ApiKeyCredentials, 'raw'>
            | Omit<BasicApiCredentials, 'raw'>
            | Omit<TbaCredentials, 'raw'>
            | { type: 'APP'; app_id: string; installation_id: string }
            | { type: 'NONE' };
        end_user?: EndUserInput | undefined;
    };
    Success: ApiPublicConnectionFull;
}>;

export type ApiConnectionFull = Omit<
    ReplaceInObject<DBConnectionDecrypted, Date, string>,
    'credentials_iv' | 'end_user_id' | 'credentials_tag' | 'deleted' | 'deleted_at'
>;
export type GetConnection = Endpoint<{
    Method: 'GET';
    Params: {
        connectionId: string;
    };
    Querystring: {
        env: string;
        provider_config_key: string;
    };
    Path: '/api/v1/connections/:connectionId';
    Error: ApiError<'unknown_provider_config'>;
    Success: {
        data: {
            provider: string;
            connection: ApiConnectionFull;
            endUser: ApiEndUser | null;
            errorLog: ActiveLog | null;
        };
    };
}>;

export type ApiPublicConnectionFull = Pick<DBConnection, 'id' | 'connection_id' | 'connection_config'> & {
    provider_config_key: string; // original prop in DB, is marked as deprecated but not for the API
    created_at: string;
    updated_at: string;
    last_fetched_at: string | null;
    metadata: Record<string, unknown> | null;
    provider: string;
    errors: { type: string; log_id: string }[];
    end_user: ApiEndUser | null;
    credentials: AllAuthCredentials;
};
export type GetPublicConnection = Endpoint<{
    Method: 'GET';
    Params: {
        connectionId: string;
    };
    Querystring: {
        provider_config_key: string;
        refresh_token?: boolean | undefined;
        force_refresh?: boolean | undefined;
    };
    Path: '/connection/:connectionId';
    Error: ApiError<'unknown_provider_config' | 'invalid_credentials'>;
    Success: ApiPublicConnectionFull;
}>;

export type PatchPublicConnection = Endpoint<{
    Method: 'PATCH';
    Path: '/connections/:connectionId';
    Params: {
        connectionId: string;
    };
    Querystring: {
        provider_config_key: string;
    };
    Body: {
        end_user?: EndUserInput | undefined;
    };
    Success: { success: boolean };
    Error: ApiError<'unknown_provider_config'>;
}>;

export type PostConnectionRefresh = Endpoint<{
    Method: 'POST';
    Params: {
        connectionId: string;
    };
    Querystring: {
        env: string;
        provider_config_key: string;
    };
    Path: '/api/v1/connections/:connectionId/refresh';
    Error: ApiError<'unknown_provider_config'> | ApiError<'failed_to_refresh', any, ActiveLog | null>;
    Success: {
        data: {
            success: boolean;
        };
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
