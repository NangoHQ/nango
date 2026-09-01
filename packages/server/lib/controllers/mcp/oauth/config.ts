import { basePublicUrl, baseUrl, isProd } from '@nangohq/utils';

import { envs } from '../../../env.js';

import type { JWKS } from 'oidc-provider';

export const MANAGEMENT_MCP_OAUTH_SCOPE = 'environment:logs:read';
export const MANAGEMENT_MCP_OAUTH_PROVIDER_PATH = '/oauth/management-mcp';

const DEV_COOKIE_KEYS = ['nango-management-mcp-oauth-development-key-1', 'nango-management-mcp-oauth-development-key-2'];
const DEV_STORAGE_KEY = 'nango-management-mcp-oauth-development-storage-key';
const DEV_JWKS: JWKS = {
    keys: [
        {
            kty: 'EC',
            x: 'eE8OQRah35uVdQAIynnJjjZzGxkchfwDMFLKzeaVRnk',
            y: 'rLsRD3JgMu4glOMF_d_S1oImUf38HjI9CwKrl8XPJEk',
            crv: 'P-256',
            d: 'mJGgaSmIVV9K7CFN2kyfYsDsKYmMVmP9GF0eERUf654',
            use: 'sig',
            alg: 'ES256',
            kid: 'nango-mcp-oauth-dev'
        }
    ]
};

export interface ManagementMcpOAuthConfig {
    issuer: string;
    resource: string;
    interactionUrl: string;
    cookieKeys: string[];
    storageKey: string;
    jwks: JWKS;
    secureCookies: boolean;
}

export function isManagementMcpOAuthEnabled(): boolean {
    return envs.NANGO_MANAGEMENT_MCP_OAUTH_ENABLED && Boolean(envs.NANGO_MANAGEMENT_MCP_SERVER_URL);
}

export function getManagementMcpOAuthConfig(): ManagementMcpOAuthConfig {
    if (!isManagementMcpOAuthEnabled() || !envs.NANGO_MANAGEMENT_MCP_SERVER_URL) {
        throw new Error('Management MCP OAuth is not enabled');
    }

    const issuer = stripTrailingSlash(envs.NANGO_MANAGEMENT_MCP_OAUTH_ISSUER ?? new URL(MANAGEMENT_MCP_OAUTH_PROVIDER_PATH, baseUrl).toString());
    const resource = new URL('/mcp', envs.NANGO_MANAGEMENT_MCP_SERVER_URL).toString();
    const interactionUrl = new URL('/oauth/authorize', basePublicUrl).toString();
    const cookieKeys = parseStringArray('NANGO_MANAGEMENT_MCP_OAUTH_COOKIE_KEYS', envs.NANGO_MANAGEMENT_MCP_OAUTH_COOKIE_KEYS, DEV_COOKIE_KEYS);
    const jwks = parseJwks(envs.NANGO_MANAGEMENT_MCP_OAUTH_JWKS);
    const storageKey = envs.NANGO_MANAGEMENT_MCP_OAUTH_STORAGE_KEY ?? (isProd ? '' : DEV_STORAGE_KEY);

    assertSecureUrl('issuer', issuer);
    assertSecureUrl('resource', resource);
    assertSecureUrl('interaction URL', interactionUrl);
    if (new URL(issuer).pathname !== MANAGEMENT_MCP_OAUTH_PROVIDER_PATH) {
        throw new Error(`NANGO_MANAGEMENT_MCP_OAUTH_ISSUER must use the ${MANAGEMENT_MCP_OAUTH_PROVIDER_PATH} path`);
    }

    if (cookieKeys.length < 2 || cookieKeys.some((key) => key.length < 32)) {
        throw new Error('NANGO_MANAGEMENT_MCP_OAUTH_COOKIE_KEYS must contain at least two strings of 32 or more characters');
    }
    if (storageKey.length < 32) {
        throw new Error('NANGO_MANAGEMENT_MCP_OAUTH_STORAGE_KEY must contain at least 32 characters');
    }

    return {
        issuer,
        resource,
        interactionUrl,
        cookieKeys,
        storageKey,
        jwks,
        secureCookies: new URL(issuer).protocol === 'https:'
    };
}

function parseStringArray(name: string, raw: string | undefined, developmentDefault: string[]): string[] {
    if (!raw) {
        if (isProd) {
            throw new Error(`${name} is required when management MCP OAuth is enabled in production`);
        }
        return developmentDefault;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === 'string')) {
            throw new Error('expected a JSON string array');
        }
        return parsed;
    } catch (err) {
        throw new Error(`${name} must be a JSON string array`, { cause: err });
    }
}

function parseJwks(raw: string | undefined): JWKS {
    if (!raw) {
        if (isProd) {
            throw new Error('NANGO_MANAGEMENT_MCP_OAUTH_JWKS is required when management MCP OAuth is enabled in production');
        }
        return DEV_JWKS;
    }

    try {
        const parsed = JSON.parse(raw) as JWKS;
        if (
            !Array.isArray(parsed.keys) ||
            parsed.keys.length === 0 ||
            parsed.keys.some((key) => !('d' in key) || typeof key.d !== 'string' || !('kid' in key) || typeof key.kid !== 'string')
        ) {
            throw new Error('expected a private JSON Web Key Set with key IDs');
        }
        return parsed;
    } catch (err) {
        throw new Error('NANGO_MANAGEMENT_MCP_OAUTH_JWKS must be a private JSON Web Key Set', { cause: err });
    }
}

function assertSecureUrl(label: string, value: string): void {
    const url = new URL(value);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) {
        return;
    }
    throw new Error(`Management MCP OAuth ${label} must use HTTPS outside localhost`);
}

function stripTrailingSlash(value: string): string {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}
