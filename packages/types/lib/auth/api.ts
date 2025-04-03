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
    TBA: 'TBA';
    Tableau: 'TABLEAU';
    Jwt: 'JWT';
    Bill: 'BILL';
    TwoStep: 'TWO_STEP';
    Signature: 'SIGNATURE';
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

export interface OAuth1Token {
    oAuthToken: string;
    oAuthTokenSecret: string;
}

export interface BasicApiCredentials {
    type: AuthModes['Basic'];
    username: string;
    password: string;
}

export interface ApiKeyCredentials {
    type: AuthModes['ApiKey'];
    apiKey: string;
}

export interface AppCredentials {
    type: AuthModes['App'];
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

export interface TbaCredentials {
    type: AuthModes['TBA'];
    token_id: string;
    token_secret: string;

    config_override: {
        client_id?: string;
        client_secret?: string;
    };
}

export interface BillCredentials extends CredentialsCommon {
    type: AuthModes['Bill'];
    username: string;
    password: string;
    organization_id: string;
    dev_key: string;
    session_id?: string;
    user_id?: string;
    expires_at?: Date | undefined;
}

export interface TableauCredentials extends CredentialsCommon {
    type: AuthModes['Tableau'];
    pat_name: string;
    pat_secret: string;
    content_url?: string;
    token?: string;
    expires_at?: Date | undefined;
}

export interface JwtCredentials {
    type: AuthModes['Jwt'];
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
    type: AuthModes['TwoStep'];
    [key: string]: any;
    token?: string;
    expires_at?: Date | undefined;
}

export interface SignatureCredentials {
    type: AuthModes['Signature'];
    username: string;
    password: string;
    token?: string;
    expires_at?: Date | undefined;
}

export type UnauthCredentials = Record<string, never>;

export type RefreshTokenResponse = AuthorizationTokenResponse;

export interface AuthorizationTokenResponse extends Omit<OAuth2Credentials, 'type' | 'raw'> {
    expires_in?: number;
}

export type TestableCredentials = ApiKeyCredentials | BasicApiCredentials | TbaCredentials | JwtCredentials | SignatureCredentials;
export type RefreshableCredentials =
    | OAuth2Credentials
    | AppCredentials
    | AppStoreCredentials
    | OAuth2ClientCredentials
    | TableauCredentials
    | JwtCredentials
    | TwoStepCredentials
    | BillCredentials
    | SignatureCredentials;

export type AllAuthCredentials =
    | OAuth1Credentials
    | OAuth2Credentials
    | OAuth2ClientCredentials
    | BasicApiCredentials
    | ApiKeyCredentials
    | AppCredentials
    | AppStoreCredentials
    | UnauthCredentials
    | CustomCredentials
    | TbaCredentials
    | TableauCredentials
    | JwtCredentials
    | BillCredentials
    | TwoStepCredentials
    | SignatureCredentials;
