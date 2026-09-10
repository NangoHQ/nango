import { describe, expect, it, vi } from 'vitest';

import { getOAuthServerConfig } from './config.js';

const settings = await vi.hoisted(async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return {
        NANGO_CLOUD: true,
        NANGO_MANAGEMENT_MCP_OAUTH_ENABLED: true,
        NANGO_MANAGEMENT_MCP_SERVER_URL: 'https://mcp.nango.dev',
        NANGO_OAUTH_SERVER_BASE_URL: undefined as string | undefined,
        NANGO_OAUTH_SERVER_COOKIE_KEYS: JSON.stringify(['a'.repeat(32), 'b'.repeat(32)]),
        NANGO_OAUTH_SERVER_JWKS: JSON.stringify({ keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' }] })
    };
});
vi.mock('../env.js', () => ({ envs: settings, dek: { get: () => Buffer.alloc(32, 's').toString('base64') } }));

describe('Nango OAuth issuer configuration', () => {
    it('defaults cloud to the single id.nango.dev issuer without a Management MCP suffix', () => {
        expect(getOAuthServerConfig()?.config.baseUrl).toBe('https://id.nango.dev');
        expect(getOAuthServerConfig()?.resources).toEqual([{ resource: 'https://mcp.nango.dev/mcp', scopes: ['environment:*'] }]);
    });
    it('supports explicit local/self-hosted issuers', () => {
        settings.NANGO_CLOUD = false;
        settings.NANGO_OAUTH_SERVER_BASE_URL = 'http://localhost:3003';
        try {
            expect(getOAuthServerConfig()?.config.baseUrl).toBe('http://localhost:3003');
        } finally {
            settings.NANGO_CLOUD = true;
            settings.NANGO_OAUTH_SERVER_BASE_URL = undefined;
        }
    });
});
