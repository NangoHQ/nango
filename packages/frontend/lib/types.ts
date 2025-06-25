export type AuthErrorType =
    | 'missingAuthToken'
    | 'blocked_by_browser'
    | 'invalidHostUrl'
    | 'missingCredentials'
    | 'windowClosed'
    | 'connection_test_failed'
    | 'missing_connect_session_token'
    | 'resource_capped';

export interface AuthResult {
    providerConfigKey: string;
    connectionId: string;
    isPending?: boolean;
}

export type AuthOptions = {
    detectClosedAuthWindow?: boolean; // If true, `nango.auth()` would fail if the login window is closed before the authorization flow is completed
} & (ConnectionConfig | OAuthCredentialsOverride);

export type ErrorHandler = (errorType: AuthErrorType, errorDesc: string) => void;

export interface ConnectionConfig {
    params?: Record<string, string>;
    hmac?: string;
    user_scope?: string[];
    authorization_params?: Record<string, string | undefined>;
    credentials?:
        | OAuthCredentialsOverride
        | BasicApiCredentials
        | ApiKeyCredentials
        | AppStoreCredentials
        | TBACredentials
        | JwtCredentials
        | TwoStepCredentials
        | OAuth2ClientCredentials
        | SignatureCredentials;
}

export interface OAuthCredentialsOverride {
    oauth_client_id_override: string;
    oauth_client_secret_override: string;
}

export interface BasicApiCredentials {
    username?: string;
    password?: string;
}

export interface ApiKeyCredentials {
    apiKey?: string;
}

export interface AppStoreCredentials {
    privateKeyId: string;
    issuerId: string;
    privateKey: string;
    scope?: string[];
}

export interface TBACredentials {
    token_id: string;
    token_secret: string;
    oauth_client_id_override?: string;
    oauth_client_secret_override?: string;
}

export interface JwtCredentials {
    type?: 'JWT';
    [key: string]: any;
}

export interface OAuth2ClientCredentials {
    client_id: string;
    client_secret: string;
    client_certificate?: string;
    client_private_key?: string;
}

export interface BillCredentials {
    username: string;
    password: string;
    organization_id: string;
    dev_key: string;
}

export interface TwoStepCredentials {
    type: 'TWO_STEP';
    [key: string]: any;
}

export interface SignatureCredentials {
    type: 'SIGNATURE';
    username: string;
    password: string;
}

export const enum WSMessageType {
    ConnectionAck = 'connection_ack',
    Error = 'error',
    Success = 'success'
}

// This one is sent by parent only
export interface ConnectUIEventToken {
    type: 'session_token';
    sessionToken: string;
}

export interface ConnectUIEventReady {
    type: 'ready';
}

export interface ConnectUIEventClose {
    type: 'close';
}

export interface ConnectUIEventConnect {
    type: 'connect';
    payload: AuthResult;
}

export type ConnectUIEvent = ConnectUIEventReady | ConnectUIEventClose | ConnectUIEventConnect;
