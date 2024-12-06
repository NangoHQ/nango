import type { ApiError, Endpoint } from '../api';

export type ConnectionQueryString = {
    connection_id?: string | undefined;
    params?: Record<string, any> | undefined;
    user_scope?: string | undefined;
} & (
    | {
          public_key: string;
          hmac?: string | undefined;
      }
    | { connect_session_token: string }
);

export interface ConnectionResponse {
    providerConfigKey: string;
    connectionId: string;
}

type AuthErrors =
    | ApiError<'invalid_body'>
    | ApiError<'invalid_query_params'>
    | ApiError<'unknown_provider_config'>
    | ApiError<'unknown_provider_template'>
    | ApiError<'invalid_auth_mode'>
    | ApiError<'invalid_credentials'>
    | ApiError<'integration_not_allowed'>
    | ApiError<'invalid_connection'>
    | ApiError<'connection_test_failed'>;

export type PostPublicApiKeyAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        apiKey: string;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/api-auth/api-key/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicAppStoreAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        privateKeyId: string;
        privateKey: string;
        issuerId: string;
        scope?: string | undefined;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/app-store-auth/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicBasicAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        username: string;
        password: string;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/api-auth/basic/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicTbaAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        token_id: string;
        token_secret: string;
        oauth_client_id_override?: string | undefined;
        oauth_client_secret_override?: string | undefined;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/tba/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicTableauAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        pat_name: string;
        pat_secret: string;
        content_url?: string | undefined;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/tableau/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicJwtAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        privateKeyId?: string;
        issuerId?: string;
        privateKey:
            | {
                  id: string;
                  secret: string;
              }
            | string;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/jwt/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicUnauthenticatedAuthorization = Endpoint<{
    Method: 'POST';
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/unauthenticated/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicBillAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        username: string;
        password: string;
        organization_id: string;
        dev_key: string;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/bill/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicTwoStepAuthorization = Endpoint<{
    Method: 'POST';
    Body: Record<string, any>;
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/two-step/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;

export type PostPublicSignatureAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        username: string;
        password: string;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/signature-based/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponse;
}>;
