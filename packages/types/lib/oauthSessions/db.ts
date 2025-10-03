import type { AuthModeType } from '../auth/api.js';
import type { Timestamps } from '../db.js';

export interface DBOAuthSession extends Timestamps {
    id: string;
    provider_config_key: string;
    provider: string;
    connection_id: string;
    callbackUrl: string;
    authMode: AuthModeType;
    connect_session_id: number | null;
    connection_config: Record<string, string>;
    environment_id: number;
    web_socket_client_id: string | undefined;
    activity_log_id: string;

    // Needed for OAuth 2.0 PKCE
    code_verifier: string | null;

    // Needed for oAuth 1.0a
    request_token_secret: string | null;
}

export interface OAuthSession {
    id: string;
    providerConfigKey: string;
    provider: string;
    connectionId: string;
    callbackUrl: string;
    authMode: AuthModeType;
    connectSessionId: number | null;
    connectionConfig: Record<string, string>;
    environmentId: number;
    webSocketClientId: string | undefined;
    activityLogId: string;

    // Needed for OAuth 2.0 PKCE
    codeVerifier: string | null;

    // Needed for oAuth 1.0a
    requestTokenSecret: string | null;

    createdAt: Date;
    updatedAt: Date;
}
