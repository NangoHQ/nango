export interface ProviderConfig {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    unique_key: string;
    provider: string;
    oauth_client_id: string;
    oauth_client_secret: string;
    oauth_scopes: string;
    account_id: number;
    oauth_client_secret_iv?: string | null;
    oauth_client_secret_tag?: string | null;
}

export interface ProviderTemplate {
    auth_mode: ProviderAuthModes;
    authorization_url: string;
    authorization_params?: Record<string, string>;
    scope_separator?: string;
    default_scopes?: string[];
    token_url: string;
    token_params?: {
        [key: string]: string;
    };
    redirect_uri_metadata?: Array<string>;
    token_response_metadata?: Array<string>;
    base_api_url?: string;
    docs?: string;
}

export interface ProviderTemplateAlias {
    alias?: string;
    base_api_url?: string;
}

export interface BaseConnection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    account_id: number;
    metadata: Record<string, string>;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
}

export interface StoredConnection extends BaseConnection {
    credentials: Record<string, any>;
}

export interface Connection extends BaseConnection {
    credentials: AuthCredentials;
}

export interface Account {
    id: number;
    name: string;
    secret_key: string;
    public_key: string;
    callback_url: string | null;
    owner_id: number | undefined;
    secret_key_iv?: string | null;
    secret_key_tag?: string | null;
    host?: string | null;
}

export interface User {
    id: number;
    email: string;
    name: string;
    hashed_password: string;
    salt: string;
    account_id: number;
    reset_password_token: string | undefined;
}

export enum OAuthBodyFormat {
    FORM = 'form',
    JSON = 'json'
}

export enum OAuthAuthorizationMethod {
    BODY = 'body',
    HEADER = 'header'
}

export interface CredentialsCommon {
    type: ProviderAuthModes;
    raw: Record<string, string>; // Raw response for credentials as received by the OAuth server or set by the user
}

export interface OAuth2Credentials extends CredentialsCommon {
    type: ProviderAuthModes.OAuth2;
    access_token: string;

    refresh_token?: string;
    expires_at?: Date | undefined;
}

export interface OAuth1Credentials extends CredentialsCommon {
    type: ProviderAuthModes.OAuth1;
    oauth_token: string;
    oauth_token_secret: string;
}

export enum ProviderAuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2'
}

export type AuthCredentials = OAuth2Credentials | OAuth1Credentials;

export interface ProviderTemplateOAuth1 extends ProviderTemplate {
    auth_mode: ProviderAuthModes.OAuth1;

    request_url: string;
    request_params?: Record<string, string>;
    request_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    token_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    signature_method: 'HMAC-SHA1' | 'RSA-SHA1' | 'PLAINTEXT';
}

export interface ProviderTemplateOAuth2 extends ProviderTemplate {
    auth_mode: ProviderAuthModes.OAuth2;

    disable_pkce?: boolean; // Defaults to false (=PKCE used) if not provided

    token_params?: {
        grant_type?: 'authorization_code' | 'client_credentials';
    };

    refresh_params?: {
        grant_type: 'refresh_token';
    };
    authorization_method?: OAuthAuthorizationMethod;
    body_format?: OAuthBodyFormat;

    refresh_url?: string;

    token_request_auth_method?: 'basic';
}

export type OAuth1RequestTokenResult = {
    request_token: string;
    request_token_secret: string;
    parsed_query_string: any;
};

export interface OAuthSession {
    providerConfigKey: string;
    provider: string;
    connectionId: string;
    callbackUrl: string;
    authMode: ProviderAuthModes;
    id: string;
    connectionConfig: Record<string, string>;
    accountId: number;
    webSocketClientId: string | undefined;

    // Needed for OAuth 2.0 PKCE
    codeVerifier: string;

    // Needed for oAuth 1.0a
    requestTokenSecret?: string;
}

export interface CredentialsRefresh {
    providerConfigKey: string;
    connectionId: string;
    promise: Promise<OAuth2Credentials>;
}

export interface DBConfig {
    encryption_key_hash?: string | null;
    encryption_complete: boolean;
}

export interface AuthorizationTokenResponse extends Omit<OAuth2Credentials, 'type' | 'raw'> {
    expires_in?: number;
}

export interface RefreshTokenResponse extends AuthorizationTokenResponse {}

export type HTTP_VERB = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ProxyBodyConfiguration {
    endpoint: string;
    provider: string;
    providerConfigKey: string;
    connectionId: string;
    token: string;
    method: HTTP_VERB;
    template: ProviderTemplate;

    retries?: number;
    data?: unknown;
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: {
        encode?: (param: string) => string;
        serialize?: (params: Record<string, any>, options?: ParamsSerializerOptions) => void;
        indexes?: boolean;
    };
}

interface ParamsSerializerOptions {
    encode?: ParamEncoder;
    serialize?: CustomParamsSerializer;
}

interface ParamEncoder {
    (value: any, defaultEncoder: (value: any) => any): any;
}

interface CustomParamsSerializer {
    (params: Record<string, any>, options?: ParamsSerializerOptions): string;
}

export enum SyncStatus {
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    STOPPED = 'STOPPED',
    SUCCESS = 'SUCCESS'
}

export enum SyncType {
    INITIAL = 'INITIAL',
    INCREMENTAL = 'INCREMENTAL'
}

export interface Sync {
    id: number;
    nango_connection_id: number;
    status: SyncStatus;
    type: SyncType;
    created_at?: Date;
    updated_at?: Date;
}
