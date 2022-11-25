export interface IntegrationConfig {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    unique_key: string;
    type: string;
    oauth_client_id: string;
    oauth_client_secret: string;
    oauth_scopes: string[];
}

export interface IntegrationTemplate {
    auth_mode: IntegrationAuthModes;
    authorization_url: string;
    authorization_params?: Record<string, string>;
    scope_separator?: string;
    token_url: string;
    token_params?: {
        [key: string]: string;
    };
}

export interface Connection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    integration_key: string;
    connection_id: string;
    credentials: object;
    raw_response: object;
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
    type: IntegrationAuthModes;
    raw: Record<string, string>; // Raw response for credentials as received by the OAuth server or set by the user
}

export interface OAuth2Credentials extends CredentialsCommon {
    type: IntegrationAuthModes.OAuth2;
    accessToken: string;

    refreshToken?: string;
    expiresAt?: Date;
}

export interface OAuth1Credentials extends CredentialsCommon {
    type: IntegrationAuthModes.OAuth1;
    oAuthToken: string;
    oAuthTokenSecret: string;
}

export enum IntegrationAuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2'
}

export type PizzlyAuthCredentials = OAuth2Credentials | OAuth1Credentials;

export interface IntegrationTemplateOAuth1 extends IntegrationTemplate {
    auth_mode: IntegrationAuthModes.OAuth1;

    request_url: string;
    request_params?: Record<string, string>;
    request_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    token_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    signature_method: 'HMAC-SHA1' | 'RSA-SHA1' | 'PLAINTEXT';
}

export interface IntegrationTemplateOAuth2 extends IntegrationTemplate {
    auth_mode: IntegrationAuthModes.OAuth2;

    token_params?: {
        grant_type?: 'authorization_code' | 'client_credentials';
    };
    authorization_method?: OAuthAuthorizationMethod;
    body_format?: OAuthBodyFormat;

    refresh_url?: string;
}

export type OAuth1RequestTokenResult = {
    request_token: string;
    request_token_secret: string;
    parsed_query_string: any;
};

export interface OAuthSession {
    integrationKey: string;
    integrationType: string;
    connectionId: string;
    callbackUrl: string;
    authMode: IntegrationAuthModes;
    id: string;

    // Needed for OAuth 2.0 PKCE
    codeVerifier: string;

    // Needed for oAuth 1.0a
    request_token_secret?: string;
}

export interface OAuthSessionStore {
    [key: string]: OAuthSession;
}

export interface PizzlyCredentialsRefresh {
    integrationKey: string;
    connectionId: string;
    promise: Promise<OAuth2Credentials>;
}
