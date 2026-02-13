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
    INSTALL_PLUGIN: 'Install Plugin',
    AWS_SIGV4: 'AWS SigV4'
};

/**
 * Maps auth mode types to human-readable display names
 */
export function getDisplayName(authMode: AuthModeType): string {
    return displayNames[authMode] || authMode.replaceAll('_', ' ').toUpperCase();
}

export function validateUrl(value: string): string | null {
    const message = 'Must be a valid URL (e.g., https://example.com)';
    try {
        // The URL constructor will throw if the URL is invalid.
        // Only accept http or https URLs.
        const url = new URL(value);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return null;
        } else {
            return message;
        }
    } catch {
        return message;
    }
}

export function validateNotEmpty(value: string): string | null {
    if (value.trim() === '') {
        return 'Must not be empty';
    }
    return null;
}
