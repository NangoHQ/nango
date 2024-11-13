import type { AuthModeType, AuthOperationType } from '@nangohq/types';
import type { ServiceResponse } from './Generic.js';
import type { StoredConnection } from './Connection.js';

export enum OAuthAuthorizationMethod {
    BODY = 'body',
    HEADER = 'header'
}

export enum OAuthBodyFormat {
    FORM = 'form',
    JSON = 'json'
}

export interface ConnectionUpsertResponse {
    connection: StoredConnection;
    operation: AuthOperationType;
}

export interface OAuthSession {
    providerConfigKey: string;
    provider: string;
    connectionId: string;
    callbackUrl: string;
    authMode: AuthModeType;
    id: string;
    connectSessionId: number | null;
    connectionConfig: Record<string, string>;
    environmentId: number;
    webSocketClientId: string | undefined;
    activityLogId: string;

    // Needed for OAuth 2.0 PKCE
    codeVerifier: string;

    // Needed for oAuth 1.0a
    requestTokenSecret?: string;
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
    type?: 'BASIC';
    username: string;
    password: string;
}

export interface ApiKeyCredentials {
    type?: 'API_KEY';
    apiKey: string;
}

export type AuthCredentials =
    | OAuth2Credentials
    | OAuth1Credentials
    | OAuth2ClientCredentials
    | TbaCredentials
    | TableauCredentials
    | BillCredentials
    | TwoStepCredentials
    | SignatureCredentials
    | JwtCredentials
    | ApiKeyCredentials
    | BasicApiCredentials;

export interface AppCredentials {
    type?: 'APP';
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
}

export interface AppStoreCredentials {
    type?: 'APP_STORE';
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
    private_key: string;
}

export interface OAuth2Credentials extends CredentialsCommon {
    type: 'OAUTH2';
    access_token: string;

    refresh_token?: string;
    expires_at?: Date | undefined;

    config_override?: {
        client_id?: string;
        client_secret?: string;
    };
}

export interface OAuth2ClientCredentials extends CredentialsCommon {
    type: 'OAUTH2_CC';
    token: string;

    expires_at?: Date | undefined;

    client_id: string;
    client_secret: string;
}

export interface OAuth1Credentials extends CredentialsCommon {
    type: 'OAUTH1';
    oauth_token: string;
    oauth_token_secret: string;
}

export interface CredentialsRefresh {
    providerConfigKey: string;
    connectionId: string;
    promise: Promise<ServiceResponse<OAuth2Credentials>>;
}

export type UnauthCredentials = Record<string, never>;

export interface TbaCredentials {
    type: 'TBA';
    token_id: string;
    token_secret: string;

    config_override: {
        client_id?: string;
        client_secret?: string;
    };
}

export interface TableauCredentials extends CredentialsCommon {
    type: 'TABLEAU';
    pat_name: string;
    pat_secret: string;
    content_url?: string;
    token?: string;
    expires_at?: Date | undefined;
}

export interface JwtCredentials {
    type: 'JWT';
    privateKeyId?: string;
    issuerId?: string;
    privateKey:
        | {
              id: string;
              secret: string;
          }
        | string; // Colon-separated string for Ghost Admin: 'id:secret'
    token?: string;
    expires_at?: Date | undefined;
}

export interface TwoStepCredentials extends CredentialsCommon {
    type: 'TWO_STEP';
    [key: string]: any;
    token?: string;
    expires_at?: Date | undefined;
}

export interface BillCredentials extends CredentialsCommon {
    type: 'BILL';
    username: string;
    password: string;
    organization_id: string;
    dev_key: string;
    session_id?: string;
    user_id?: string;
    expires_at?: Date | undefined;
}

export interface SignatureCredentials {
    type: 'SIGNATURE';
    username: string;
    password: string;
    token?: string;
    expires_at?: Date | undefined;
}

export type RefreshTokenResponse = AuthorizationTokenResponse;

export interface AuthorizationTokenResponse extends Omit<OAuth2Credentials, 'type' | 'raw'> {
    expires_in?: number;
}
