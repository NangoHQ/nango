import type { ApiError, Endpoint } from '../api.js';

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

export interface ConnectionResponseSuccess {
    providerConfigKey: string;
    connectionId: string;
    isPending?: boolean;
    privateKey?: string | undefined;
}
export type ConnectionResponseSuccessWithSignature = ConnectionResponseSuccess & {
    signature: string;
    signedPayload: ConnectionResponseSuccess;
};

export type WebSocketConnectionMessage =
    | WebSocketConnectionAck
    | WebSocketConnectionError
    | WebSocketConnectionResponseSuccess
    | WebSocketConnectionResponseSuccessWithSignature;
export interface WebSocketConnectionAck {
    message_type: 'connection_ack';
    ws_client_id: string;
}
export interface WebSocketConnectionError {
    message_type: 'error';
    provider_config_key?: string | undefined;
    connection_id?: string | undefined;
    error_type: string;
    error_desc: string;
}
export interface WebSocketConnectionResponseSuccess {
    message_type: 'success';
    provider_config_key: string;
    connection_id: string;
    is_pending: boolean;
    private_key?: string | undefined;
}
export type WebSocketConnectionResponseSuccessWithSignature = WebSocketConnectionResponseSuccess & {
    signature: string;
    signed_payload: ConnectionResponseSuccess;
};

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
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
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
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
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
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
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
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
}>;

export type PostPublicJwtAuthorization = Endpoint<{
    Method: 'POST';
    Body: Record<string, any>;
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/jwt/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
}>;

export type PostPublicUnauthenticatedAuthorization = Endpoint<{
    Method: 'POST';
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/unauthenticated/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
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
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
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
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
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
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
}>;

export type PostPublicOauthOutboundAuthorization = Endpoint<{
    Method: 'POST';
    Body: {
        username: string;
        password: string;
    };
    Querystring: ConnectionQueryString;
    Params: {
        providerConfigKey: string;
    };
    Path: '/auth/oauth-outbound/:providerConfigKey';
    Error: AuthErrors;
    Success: ConnectionResponseSuccess | ConnectionResponseSuccessWithSignature;
}>;
