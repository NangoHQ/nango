import type { ApiEndpoint, ApiError, ApiTimestamps } from '../../api.js';
import type { AuditPolicy } from '../../audit-trail/event.js';
import type {
    ApiKeyCredentials,
    ApiPublicAllAuthCredentials,
    BasicApiCredentials,
    OAuth1Credentials,
    OAuth2ClientCredentials,
    OAuth2Credentials,
    TbaCredentials
} from '../../auth/api.js';
import type { ConnectionAuthClaim } from '../../auth/http.api.js';
import type { EndUserInput } from '../../connect/api.js';
import type { Tags } from '../../db.js';
import type { ApiEndUser } from '../../endUser/index.js';
import type { ActiveLog } from '../../notification/active-logs/db.js';
import type { ReplaceInObject } from '../../utils.js';
import type { ConnectionConfig, DBConnection, DBConnectionDecrypted } from '../db.js';
import type { Merge } from 'type-fest';

export type ApiConnectionSimple = Pick<
    Merge<DBConnection, ApiTimestamps>,
    'id' | 'config_id' | 'connection_id' | 'provider_config_key' | 'created_at' | 'updated_at'
> & {
    provider: string;
    errors: { type: string; log_id: string }[];
    endUser: ApiEndUser | null;
    tags: Tags;
    pausedSyncs: string[];
};
export type GetConnections = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
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

export type GetConnectionsCount = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
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
    tags: Tags;
};
export type GetPublicConnections = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Querystring: {
        connectionId?: string | undefined;
        search?: string | undefined;
        endUserId?: string | undefined;
        integrationId?: string | undefined;
        endUserOrganizationId?: string | undefined;
        tags?: Tags | undefined;
        limit?: number | undefined;
        page?: number | undefined;
    };
    Path: '/connection';
    Success: {
        connections: ApiPublicConnection[];
    };
}>;

export type PostPublicConnection = ApiEndpoint<{
    Audit: AuditPolicy<'connection', 'created' | 'reauthorized', 'environment', ConnectionAuthClaim>;
    Method: 'POST';
    Path: '/connections';
    Body: {
        connection_id?: string | undefined;
        provider_config_key: string;
        metadata?: Record<string, unknown> | undefined;
        connection_config?: ConnectionConfig | undefined;
        webhook_url_override?: string | undefined;
        credentials:
            | Omit<OAuth2Credentials, 'raw'>
            | Omit<OAuth2ClientCredentials, 'raw'>
            | Omit<OAuth1Credentials, 'raw'>
            | Omit<ApiKeyCredentials, 'raw'>
            | Omit<BasicApiCredentials, 'raw'>
            | Omit<TbaCredentials, 'raw'>
            | { type: 'APP'; app_id: string; installation_id: string }
            | { type: 'CUSTOM'; app_id: string; installation_id: string }
            | { type: 'NONE' };
        end_user?: EndUserInput | undefined;
        tags?: Tags | undefined;
    };
    Error: ApiError<'connection_test_failed'> | ApiError<'connection_validation_failed'>;
    Success: ApiPublicConnectionFull;
}>;

export type ApiConnectionFull = Omit<
    ReplaceInObject<DBConnectionDecrypted, Date, string>,
    'credentials_iv' | 'end_user_id' | 'credentials_tag' | 'deleted' | 'deleted_at'
>;
export type GetConnection = ApiEndpoint<{
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
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Success: {
        data: {
            provider: string;
            connection: ApiConnectionFull;
            endUser: ApiEndUser | null;
            errorLog: ActiveLog | null;
        };
    };
}>;

export type ApiPublicConnectionFull = Pick<DBConnection, 'id' | 'connection_id' | 'connection_config' | 'webhook_url_override'> & {
    provider_config_key: string; // original prop in DB, is marked as deprecated but not for the API
    created_at: string;
    updated_at: string;
    last_fetched_at: string | null;
    metadata: Record<string, unknown> | null;
    provider: string;
    errors: { type: string; log_id: string }[];
    end_user: ApiEndUser | null;
    tags: Tags;
    credentials: ApiPublicAllAuthCredentials;
};
export type GetPublicConnection = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Params: {
        connectionId: string;
    };
    Querystring: {
        provider_config_key: string;
        refresh_token?: boolean | undefined;
        force_refresh?: boolean | undefined;
        refresh_github_app_jwt_token?: boolean | undefined;
    };
    Path: '/connection/:connectionId';
    Error: ApiError<'unknown_provider_config' | 'not_found' | 'invalid_credentials' | 'server_error'>;
    Success: ApiPublicConnectionFull;
}>;

export type PatchPublicConnection = ApiEndpoint<{
    Audit: AuditPolicy<'connection', 'updated', 'environment'>;
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
        tags?: Tags | undefined;
        webhook_url_override?: string | undefined;
    };
    Success: { success: boolean };
    Error: ApiError<'unknown_provider_config' | 'not_found' | 'server_error' | 'invalid_body'>;
}>;

export type PatchConnection = ApiEndpoint<{
    Audit: AuditPolicy<'connection', 'updated', 'environment'>;
    Method: 'PATCH';
    Path: '/api/v1/connections/:connectionId';
    Params: {
        connectionId: string;
    };
    Querystring: {
        provider_config_key: string;
        env: string;
    };
    Body: {
        end_user?: EndUserInput | undefined;
        tags?: Tags | undefined;
        webhook_url_override?: string | undefined;
    };
    Success: { success: boolean };
    Error: ApiError<'unknown_provider_config' | 'not_found' | 'server_error' | 'invalid_body'>;
}>;

export type PostConnectionRefresh = ApiEndpoint<{
    Audit: AuditPolicy<'connection', 'refreshed', 'environment'>;
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

export type DeletePublicConnection = ApiEndpoint<{
    Audit: AuditPolicy<'connection', 'deleted', 'environment'>;
    Method: 'DELETE';
    Path: '/connection/:connectionId';
    Params: { connectionId: string };
    Querystring: { provider_config_key: string };
    Error: ApiError<'unknown_connection'> | ApiError<'unknown_provider_config'>;
    Success: { success: boolean };
}>;

export type DeleteConnection = ApiEndpoint<{
    Method: 'DELETE';
    Path: '/api/v1/connections/:connectionId';
    Params: { connectionId: string };
    Querystring: { provider_config_key: string; env: string };
    Error: ApiError<'unknown_connection'> | ApiError<'unknown_provider_config'>;
    Success: { success: boolean };
    Audit: AuditPolicy<'connection', 'deleted', 'environment'>;
}>;
