import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getOAuthServerConfig } from './config.js';

const settings = await vi.hoisted(async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return {
        dashboardApiUrl: 'https://api.nango.dev',
        basePublicUrl: 'https://app.nango.dev',
        NANGO_CLOUD: true,
        NANGO_MANAGEMENT_MCP_OAUTH_ENABLED: true,
        NANGO_MANAGEMENT_MCP_SERVER_URL: 'https://mcp.nango.dev',
        NANGO_OAUTH_SERVER_BASE_URL: undefined as string | undefined,
        NANGO_OAUTH_SERVER_COOKIE_KEYS: JSON.stringify(['a'.repeat(32), 'b'.repeat(32)]),
        NANGO_OAUTH_SERVER_JWKS: JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' }] })
    };
});
vi.mock('../env.js', () => ({ envs: settings, dek: { get: () => Buffer.alloc(32, 's').toString('base64') } }));
vi.mock('@nangohq/utils', () => ({
    get dashboardApiUrl() {
        return settings.dashboardApiUrl;
    },
    get basePublicUrl() {
        return settings.basePublicUrl;
    }
}));

describe('Nango OAuth issuer configuration', () => {
    beforeEach(() => {
        settings.dashboardApiUrl = 'https://api.nango.dev';
        settings.NANGO_OAUTH_SERVER_BASE_URL = undefined;
        settings.NANGO_MANAGEMENT_MCP_OAUTH_ENABLED = true;
    });
    it('defaults to the browser-facing dashboard API without a Management MCP suffix', () => {
        expect(getOAuthServerConfig()?.config.baseUrl).toBe('https://api.nango.dev');
        expect(getOAuthServerConfig()?.resources).toEqual([{ resource: 'https://mcp.nango.dev/mcp', scopes: ['environment:*'] }]);
    });
    it('supports explicit local/self-hosted issuers', () => {
        settings.dashboardApiUrl = 'http://localhost:3003';
        settings.NANGO_OAUTH_SERVER_BASE_URL = 'http://localhost:3003';
        expect(getOAuthServerConfig()?.config.baseUrl).toBe('http://localhost:3003');
    });
    it('supports a same-origin dashboard API proxy', () => {
        settings.dashboardApiUrl = '/';
        expect(getOAuthServerConfig()?.config.baseUrl).toBe('https://app.nango.dev');
    });
    it.each(['https://id.nango.dev', 'https://api.nango.dev:8443'])('rejects an issuer that cannot share the dashboard session: %s', (issuer) => {
        settings.NANGO_OAUTH_SERVER_BASE_URL = issuer;
        expect(() => getOAuthServerConfig()).toThrow('must match the browser-facing dashboard API origin');
    });
    it('does not validate unused issuer configuration when OAuth is disabled', () => {
        settings.NANGO_MANAGEMENT_MCP_OAUTH_ENABLED = false;
        settings.NANGO_OAUTH_SERVER_BASE_URL = 'https://id.nango.dev';
        expect(getOAuthServerConfig()).toBeNull();
    });
});
