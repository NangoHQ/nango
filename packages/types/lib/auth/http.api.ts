import type { ApiError, Endpoint } from '../api';

export type PostPublicTbaAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        token_id: string;
        token_secret: string;
        oauth_client_id_override?: string | undefined;
        oauth_client_secret_override?: string | undefined;
    };
    Querystring: {
        connection_id?: string | undefined;
        params?: Record<string, any> | undefined;
        hmac?: string | undefined;
    };
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/tba';
    Error:
        | ApiError<'invalid_body'>
        | ApiError<'invalid_query_params'>
        | ApiError<'unknown_provider_config'>
        | ApiError<'unknown_provider_template'>
        | ApiError<'invalid_auth_mode'>
        | ApiError<'invalid_credentials'>;
    Success: {
        providerConfigKey: string;
        connectionId: string;
    };
}>;

export type PostPublicTableauAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        pat_name: string;
        pat_secret: string;
        content_url?: string | undefined;
    };
    Querystring: {
        connection_id?: string | undefined;
        params?: Record<string, any> | undefined;
        hmac?: string | undefined;
    };
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/tableau';
    Error:
        | ApiError<'invalid_body'>
        | ApiError<'invalid_query_params'>
        | ApiError<'unknown_provider_config'>
        | ApiError<'unknown_provider_template'>
        | ApiError<'invalid_auth_mode'>
        | ApiError<'invalid_credentials'>;
    Success: {
        providerConfigKey: string;
        connectionId: string;
    };
}>;

export type PostPublicGhostAdminAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        ghost_api_key: string;
        token?: string | undefined;
    };
    Querystring: {
        connection_id?: string | undefined;
        params?: Record<string, any> | undefined;
        hmac?: string | undefined;
    };
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/ghost-admin';
    Error:
        | ApiError<'invalid_body'>
        | ApiError<'invalid_query_params'>
        | ApiError<'unknown_provider_config'>
        | ApiError<'unknown_provider_template'>
        | ApiError<'invalid_auth_mode'>
        | ApiError<'invalid_credentials'>;
    Success: {
        providerConfigKey: string;
        connectionId: string;
    };
}>;

export type PostPublicUnauthenticatedAuthorization = Endpoint<{
    Method: 'POST';
    Querystring: {
        connection_id?: string | undefined;
        hmac?: string | undefined;
    };
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/unauthenticated';
    Error:
        | ApiError<'invalid_body'>
        | ApiError<'invalid_query_params'>
        | ApiError<'unknown_provider_config'>
        | ApiError<'unknown_provider_template'>
        | ApiError<'invalid_auth_mode'>
        | ApiError<'invalid_credentials'>;
    Success: {
        providerConfigKey: string;
        connectionId: string;
    };
}>;
