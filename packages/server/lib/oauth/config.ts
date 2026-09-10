import { parseOAuthServerConfig } from '@nangohq/oauth-server';
import { basePublicUrl, dashboardApiUrl } from '@nangohq/utils';

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

    const sessionOrigin = new URL(dashboardApiUrl, basePublicUrl).origin;
    const config = parseOAuthServerConfig({
        baseUrl: envs.NANGO_OAUTH_SERVER_BASE_URL ?? sessionOrigin,
        cookieKeys: envs.NANGO_OAUTH_SERVER_COOKIE_KEYS,
        encryptionKey: dek.get(),
        jwks: envs.NANGO_OAUTH_SERVER_JWKS
    });
    // Dashboard login and OAuth interactions must receive the same host-only cookie.
    // Keep the override, but fail at startup instead of sending users around a login loop.
    if (config.baseUrl !== sessionOrigin) {
        throw new Error('NANGO_OAUTH_SERVER_BASE_URL must match the browser-facing dashboard API origin to reuse its session');
    }
    return {
        config,
        resources
    };
}
