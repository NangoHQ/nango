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

export interface PizzlyIntegrationRequestsConfig {
    base_url: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
}

export interface PizzlyIntegrationConfigCommon {
    [key: string]: any; // Needed so that TypeScript allows us to index this with strings. Whenever possible access directly through the properties.

    oauth_client_id?: string;
    oauth_client_secret?: string;
    oauth_scopes?: string[];

    app_api_key?: string; // App wide api key, can be used as a variable in PizzlyIntegrationRequestsConfig

    http_request_timeout_seconds?: number;
    log_level?: string;
}

// Allowed combos are:
// - extends_blueprint
// - extends_blueprint + auth and/or requests to override the blueprint
// - auth + requests (both required if no extends_blueprint is passed)
// All other params are optional/mandatory as marked here
export interface PizzlyIntegrationsYamlIntegrationConfig extends PizzlyIntegrationConfigCommon {
    extends_blueprint?: string;

    auth?: PizzlyIntegrationAuthConfig;
    requests?: PizzlyIntegrationRequestsConfig;
}

// PizzlyIntegrationConfig vs PizzlyIntegrationsYamlIntegrationConfig:
// PizzlyIntegrationsYamlIntegrationConfig = Integration config as specified in integrations.yaml
// PizzlyIntegrationConfig = fully resolved config ready to be used (may be merged from blueprint + overrides)
//
// Unless you work on IntegrationsManager you only ever have to deal with PizzlyIntegrationConfig
export interface PizzlyIntegrationConfig extends PizzlyIntegrationConfigCommon {
    auth: PizzlyIntegrationAuthConfig;
    requests: PizzlyIntegrationRequestsConfig;
}

export enum PizzlyIntegrationAuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    UsernamePassword = 'USERNAME_PASSWORD',
    ApiKey = 'API_KEY'
}

export interface PizzlyIntegrationAuthConfig {
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

export interface PizzlyIntegrationAuthConfigOAuth1 extends PizzlyIntegrationAuthConfig {
    auth_mode: PizzlyIntegrationAuthModes.OAuth1;

    request_url: string;
    request_params?: Record<string, string>;
    request_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    token_http_method?: 'GET' | 'PUT' | 'POST'; // Defaults to POST if not provided

    signature_method: 'HMAC-SHA1' | 'RSA-SHA1' | 'PLAINTEXT';
}

export interface PizzlyIntegrationAuthConfigOAuth2 extends PizzlyIntegrationAuthConfig {
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
