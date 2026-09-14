import { parseOAuthServerConfig } from '@nangohq/oauth-server';

import { dek, envs } from '../env.js';

import type { OAuthResourceConfig, OAuthServerParsedConfig } from '@nangohq/oauth-server';

export interface NangoOAuthServerConfig {
    config: OAuthServerParsedConfig;
    resources: readonly OAuthResourceConfig[];
}

export function getOAuthServerConfig(): NangoOAuthServerConfig | null {
    const resources: OAuthResourceConfig[] = [];
    if (envs.NANGO_MANAGEMENT_MCP_OAUTH_ENABLED) {
        if (!envs.NANGO_MANAGEMENT_MCP_SERVER_URL) {
            throw new Error('NANGO_MANAGEMENT_MCP_SERVER_URL is required when Management MCP OAuth is enabled');
        }
        const managementMcpUrl = new URL(envs.NANGO_MANAGEMENT_MCP_SERVER_URL);
        resources.push({
            resource: new URL('/mcp', managementMcpUrl.origin).href,
            scopes: ['environment:*']
        });
    }
    if (resources.length === 0) return null;

    return {
        config: parseOAuthServerConfig({
            baseUrl: envs.NANGO_OAUTH_SERVER_BASE_URL,
            cookieKeys: envs.NANGO_OAUTH_SERVER_COOKIE_KEYS,
            encryptionKey: dek.get(),
            jwks: envs.NANGO_OAUTH_SERVER_JWKS
        }),
        resources
    };
}
