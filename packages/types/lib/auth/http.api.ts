import type { ApiError, Endpoint } from '../api';
import type { ConnectionConfig } from '../connection/db';

export type TbaAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        token_id: string;
        token_secret: string;
        oauth_client_id_override?: string;
        oauth_client_secret_override?: string;
    };
    QueryParams: {
        connectionId: string;
        connectionConfig: ConnectionConfig;
    };
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/tba';
    Error:
        | ApiError<'invalid_body'>
        | ApiError<'invalid_query_params'>
        | ApiError<'unknown_provider_config'>
        | ApiError<'invalid_auth_mode'>
        | ApiError<'invalid_credentials'>;
    Success: {
        providerConfigKey: string;
        connectionId: string;
    };
}>;

export type TableauAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        pat_name: string;
        pat_secret: string;
        content_url?: string;
    };
    QueryParams: {
        connectionId: string;
        connectionConfig: ConnectionConfig;
    };
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/tableau';
    Error:
        | ApiError<'invalid_body'>
        | ApiError<'invalid_query_params'>
        | ApiError<'unknown_provider_config'>
        | ApiError<'invalid_auth_mode'>
        | ApiError<'invalid_credentials'>;
    Success: {
        providerConfigKey: string;
        connectionId: string;
    };
}>;
