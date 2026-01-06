import type { AuthModeType } from '@nangohq/types';

const displayNames: Record<AuthModeType, string> = {
    API_KEY: 'API Key',
    BASIC: 'Basic',
    SIGNATURE: 'Signature',
    TWO_STEP: 'Two Step',
    MCP_OAUTH2: 'MCP OAuth 2',
    MCP_OAUTH2_GENERIC: 'MCP OAuth 2 Generic',
    NONE: 'None',
    OAUTH1: 'OAuth 1',
    OAUTH2: 'OAuth 2',
    OAUTH2_CC: 'OAuth2 Client Credentials',
    APP: 'App',
    APP_STORE: 'App Store',
    CUSTOM: 'Custom',
    TBA: 'TBA',
    JWT: 'JWT',
    BILL: 'Bill',
    INSTALL_PLUGIN: 'Install Plugin'
};

/**
 * Maps auth mode types to human-readable display names
 */
export function getDisplayName(authMode: AuthModeType): string {
    return displayNames[authMode] || authMode.replaceAll('_', ' ').toUpperCase();
}
