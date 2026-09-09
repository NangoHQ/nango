import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseOAuthServerConfig } from './config.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const signingKey = { ...privateKey.export({ format: 'jwk' }), kid: 'key-1', use: 'sig', alg: 'RS256' };
const valid = {
    baseUrl: 'https://api.example.com',
    cookieKeys: JSON.stringify(['a'.repeat(32), 'b'.repeat(32)]),
    encryptionKey: Buffer.alloc(32, 's').toString('base64'),
    jwks: JSON.stringify({ keys: [signingKey] })
};

describe('OAuth server configuration', () => {
    it('parses explicit shared configuration', () => {
        expect(parseOAuthServerConfig(valid)).toMatchObject({
            baseUrl: 'https://api.example.com',
            cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
            encryptionKey: Buffer.alloc(32, 's').toString('base64')
        });
    });

    it('allows HTTP only for loopback development origins', () => {
        expect(parseOAuthServerConfig({ ...valid, baseUrl: 'http://localhost:3003' }).baseUrl).toBe('http://localhost:3003');
        expect(() => parseOAuthServerConfig({ ...valid, baseUrl: 'http://api.example.com' })).toThrow(/HTTPS/);
    });

    it('requires strong distinct secrets and private signing keys', () => {
        expect(() => parseOAuthServerConfig({ ...valid, cookieKeys: JSON.stringify(['short', 'also-short']) })).toThrow(/cookieKeys/);
        expect(() => parseOAuthServerConfig({ ...valid, cookieKeys: JSON.stringify(['a'.repeat(32), 'a'.repeat(32)]) })).toThrow(/distinct/);
        expect(() => parseOAuthServerConfig({ ...valid, encryptionKey: 'short' })).toThrow(/encryptionKey/);
        expect(() =>
            parseOAuthServerConfig({
                ...valid,
                jwks: JSON.stringify({ keys: [{ kid: 'key-1', use: 'sig', alg: 'RS256', kty: 'RSA', d: signingKey.d }] })
            })
        ).toThrow(/jwks/);
    });
});
