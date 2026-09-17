import { describe, expect, it } from 'vitest';

import { allowPublicCimdClient, isAllowedRedirectUri, isValidCimdClientId } from './cimd.js';

import type { Client } from 'oidc-provider';

describe('CIMD validation', () => {
    it.each(['https://client.example.com/oauth/metadata.json', 'https://client.example.com:8443/', 'https://client.example.com/%E2%9C%93'])(
        'accepts a valid client identifier URL: %s',
        (value) => {
            expect(isValidCimdClientId(value)).toBe(true);
        }
    );

    it.each([
        'http://client.example.com/oauth/metadata.json',
        'https://client.example.com',
        'https://user:password@client.example.com/metadata.json',
        'https://client.example.com/metadata.json?version=1',
        'https://client.example.com/metadata.json#fragment',
        'https://client.example.com/a/../metadata.json',
        'https://client.example.com\\@127.0.0.1/metadata.json',
        'https://client.example.com/metadata.json\n',
        `https://client.example.com/${'a'.repeat(500)}`
    ])('rejects an unsafe client identifier URL: %s', (value) => {
        expect(isValidCimdClientId(value)).toBe(false);
    });

    it.each(['https://client.example.com/callback', 'http://localhost:1234/callback', 'http://127.0.0.1:1234/callback', 'http://[::1]:1234/callback'])(
        'accepts an allowed redirect URI: %s',
        (value) => {
            expect(isAllowedRedirectUri(value)).toBe(true);
        }
    );

    it.each([
        'http://client.example.com/callback',
        'custom-app://callback',
        'https://user@example.com/callback',
        'https://example.com/callback#fragment',
        'https://localhost/callback',
        'https://127.0.0.1/callback',
        'https://10.0.0.1/callback',
        'https://[::1]/callback'
    ])('rejects a disallowed redirect URI: %s', (value) => {
        expect(isAllowedRedirectUri(value)).toBe(false);
    });

    it('accepts only the supported public-client metadata shape', () => {
        const metadata = {
            tokenEndpointAuthMethod: 'none',
            grantTypes: ['authorization_code', 'refresh_token'],
            responseTypes: ['code'],
            responseModes: ['query'],
            redirectUris: ['https://client.example.com/callback'],
            scope: 'environment:*'
        };
        const client = (overrides: Record<string, unknown> = {}) => ({ ...metadata, ...overrides }) as unknown as Client;

        expect(allowPublicCimdClient(client(), new Set(['environment:*']))).toBe(true);
        expect(allowPublicCimdClient(client({ responseModes: ['fragment'] }), new Set(['environment:*']))).toBe(false);
        expect(allowPublicCimdClient(client({ tokenEndpointAuthMethod: 'client_secret_basic' }), new Set(['environment:*']))).toBe(false);
        expect(allowPublicCimdClient(client({ scope: 'openid' }), new Set(['environment:*']))).toBe(false);
    });
});
