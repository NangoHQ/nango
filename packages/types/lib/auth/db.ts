import type { AuthModes } from './api.js';

export interface OAuthSession {
    providerConfigKey: string;
    provider: string;
    connectionId: string;
    callbackUrl: string;
    authMode: AuthModes;
    id: string;
    connectionConfig: Record<string, string>;
    environmentId: number;
    webSocketClientId: string | undefined;

    // Needed for OAuth 2.0 PKCE
    codeVerifier: string;

    // Needed for oAuth 1.0a
    requestTokenSecret?: string;
    activityLogId: string;
}
