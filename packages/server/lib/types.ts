export enum OAuthBodyFormat {
    FORM = 'form',
    JSON = 'json'
}

export enum OAuthAuthorizationMethod {
    BODY = 'body',
    HEADER = 'header'
}

export interface PizzlyCredentialsCommon {
    type: PizzlyIntegrationAuthModes;
    raw: Record<string, string>; // Raw response for credentials as received by the OAuth server or set by the user
}

export interface PizzlyOAuth2Credentials extends PizzlyCredentialsCommon {
    type: PizzlyIntegrationAuthModes.OAuth2;
    accessToken: string;

    refreshToken?: string;
    expiresAt?: Date;
}

export interface PizzlyUsernamePasswordCredentials extends PizzlyCredentialsCommon {
    type: PizzlyIntegrationAuthModes.UsernamePassword;
    username: string;
    password: string;
}

export interface PizzlyApiKeyCredentials extends PizzlyCredentialsCommon {
    type: PizzlyIntegrationAuthModes.ApiKey;
    apiKey: string;
}

export interface PizzlyOAuth1Credentials extends PizzlyCredentialsCommon {
    type: PizzlyIntegrationAuthModes.OAuth1;
    oAuthToken: string;
    oAuthTokenSecret: string;
}

export interface PizzlyIntegrationConfig {
    [key: string]: any; // Needed so that TypeScript allows us to index this with strings. Whenever possible access directly through the properties.

    oauth_client_id?: string;
    oauth_client_secret?: string;
    oauth_scopes?: string[];

    app_api_key?: string; // App wide api key.

    http_request_timeout_seconds?: number;
    log_level?: string;
}

export interface PizzlyIntegrationTemplate {
    // The authentication mode to use (e.g. OAuth 1, OAuth 2)
    auth_mode: PizzlyIntegrationAuthModes;

    // Config related to authorization URL forward
    authorization_url: string;
    authorization_params?: Record<string, string>;
    scope_separator?: string;

    // Config related to token request
    token_url: string;
    token_params?: {
        [key: string]: string;
    };
}

export enum PizzlyIntegrationAuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    UsernamePassword = 'USERNAME_PASSWORD',
    ApiKey = 'API_KEY'
}

export type PizzlyAuthCredentials = PizzlyOAuth2Credentials | PizzlyUsernamePasswordCredentials | PizzlyApiKeyCredentials | PizzlyOAuth1Credentials;

export interface PizzlyIntegrationTemplateOAuth1 extends PizzlyIntegrationTemplate {
    auth_mode: PizzlyIntegrationAuthModes.OAuth1;

    request_url: string;
    request_params?: Record<string, string>;
    request_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    token_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    signature_method: 'HMAC-SHA1' | 'RSA-SHA1' | 'PLAINTEXT';
}

export interface PizzlyIntegrationTemplateOAuth2 extends PizzlyIntegrationTemplate {
    auth_mode: PizzlyIntegrationAuthModes.OAuth2;

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
    integrationName: string;
    userId: string;
    callbackUrl: string;
    authMode: PizzlyIntegrationAuthModes;

    // Needed for OAuth 2.0 PKCE
    codeVerifier: string;

    // Needed for oAuth 1.0a
    request_token_secret?: string;
}

export interface OAuthSessionStore {
    [key: string]: OAuthSession;
}

export interface PizzlyCredentialsRefresh {
    integration: string;
    userId: string;
    promise: Promise<PizzlyOAuth2Credentials>;
}

export interface PizzlyConnectionPublic {
    uuid: string;
    integration: string;
    connectionId: string;
    dateCreated: Date;
    lastModified: Date;
    additionalConfig: Record<string, unknown> | undefined;
}

export interface PizzlyConnection extends PizzlyConnectionPublic {
    credentials: PizzlyAuthCredentials;
}
