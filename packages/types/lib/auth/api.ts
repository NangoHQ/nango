import type { BaseConnection } from '../connection/db.js';

export interface AuthModes {
    OAuth1: 'OAUTH1';
    OAuth2: 'OAUTH2';
    OAuth2CC: 'OAUTH2_CC';
    Basic: 'BASIC';
    ApiKey: 'API_KEY';
    AppStore: 'APP_STORE';
    Custom: 'CUSTOM';
    App: 'APP';
    None: 'NONE';
}

export type AuthModeType = AuthModes[keyof AuthModes];

export interface AuthOperation {
    CREATION: 'creation';
    OVERRIDE: 'override';
    REFRESH: 'refresh';
    UNKNOWN: 'unknown';
}

export type AuthOperationType = AuthOperation[keyof AuthOperation];

export interface OAuthAuthorizationMethod {
    BODY: 'body';
    HEADER: 'header';
}

export type OAuthAuthorizationMethodType = OAuthAuthorizationMethod[keyof OAuthAuthorizationMethod];

export type OAuthBodyFormatType = OAuthBodyFormat[keyof OAuthBodyFormat];

export interface OAuthBodyFormat {
    FORM: 'form';
    JSON: 'json';
}

export interface ConnectionUpsertResponse {
    id: number;
    operation: AuthOperation;
}

export interface OAuth1RequestTokenResult {
    request_token: string;
    request_token_secret: string;
    parsed_query_string: any;
}

export interface CredentialsCommon<T = Record<string, any>> {
    type: AuthModeType;
    raw: T;
}

export interface BasicApiCredentials {
    type?: AuthModes['Basic'];
    username: string;
    password: string;
}

export interface ApiKeyCredentials {
    type?: AuthModes['ApiKey'];
    apiKey: string;
}

export type AuthCredentials = OAuth2Credentials | OAuth1Credentials | OAuth2ClientCredentials;

export interface AppCredentials {
    type?: AuthModes['App'];
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
}

export interface AppStoreCredentials {
    type?: AuthModes['AppStore'];
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
    private_key: string;
}

export interface OAuth2Credentials extends CredentialsCommon {
    type: AuthModes['OAuth2'];
    access_token: string;

    refresh_token?: string;
    expires_at?: Date | undefined;

    config_override?: {
        client_id?: string;
        client_secret?: string;
    };
}

export interface CustomCredentials extends CredentialsCommon {
    type: AuthModes['Custom'];
}

export interface OAuth2ClientCredentials extends CredentialsCommon {
    type: AuthModes['OAuth2CC'];
    token: string;

    expires_at?: Date | undefined;

    client_id: string;
    client_secret: string;
}

export interface OAuth1Credentials extends CredentialsCommon {
    type: AuthModes['OAuth1'];
    oauth_token: string;
    oauth_token_secret: string;
}

export interface CredentialsRefresh<T = unknown> {
    providerConfigKey: string;
    connectionId: string;
    promise: Promise<T>;
}

export type UnauthCredentials = Record<string, never>;

export type RefreshTokenResponse = AuthorizationTokenResponse;

export interface AuthorizationTokenResponse extends Omit<OAuth2Credentials, 'type' | 'raw'> {
    expires_in?: number;
}

export type ImportedCredentials =
    | (OAuth2Credentials & Partial<Pick<AuthorizationTokenResponse, 'expires_in'>> & Partial<Pick<BaseConnection, 'metadata' | 'connection_config'>>)
    | OAuth1Credentials;
