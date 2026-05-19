import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import {
    buildSandboxApiKeyScopes,
    createSandboxApiKeyToken,
    createSandboxSigningSecret,
    isSandboxApiKey,
    parseSandboxApiKeyToken,
    sandboxApiKeyPrefix,
    verifySandboxApiKeyToken
} from './customer-key-sandbox-token.service.js';

describe('customer key sandbox token service', () => {
    it('creates and verifies a sandbox API key token', () => {
        const signingSecret = createSandboxSigningSecret();
        const issuedAt = Date.now();
        const expiresAt = new Date(Date.now() + 60_000);
        const token = createSandboxApiKeyToken({
            parentApiKeyId: 123,
            signingSecret,
            expiresAt,
            issuedAt
        });
        const rawJwt = token.slice(sandboxApiKeyPrefix.length);
        const decoded = jwt.decode(rawJwt, { complete: true });
        if (!decoded || typeof decoded.payload === 'string') {
            throw new Error('expected decoded JWT payload');
        }

        expect(isSandboxApiKey(token)).toBe(true);
        expect(rawJwt.split('.')).toHaveLength(3);
        expect(decoded.header).toStrictEqual({ alg: 'HS256', typ: 'JWT', kid: '123' });
        expect(decoded.payload).toStrictEqual({
            iat: Math.floor(issuedAt / 1000),
            exp: Math.ceil(expiresAt.getTime() / 1000)
        });
        expect(verifySandboxApiKeyToken({ token, signingSecret })?.kid).toBe(123);
    });

    it('rejects expired tokens', () => {
        const signingSecret = createSandboxSigningSecret();
        const token = createSandboxApiKeyToken({
            parentApiKeyId: 123,
            signingSecret,
            expiresAt: new Date(Date.now() - 1_000)
        });

        expect(verifySandboxApiKeyToken({ token, signingSecret })).toBeNull();
    });

    it('rejects tampered signatures', () => {
        const signingSecret = createSandboxSigningSecret();
        const token = createSandboxApiKeyToken({
            parentApiKeyId: 123,
            signingSecret,
            expiresAt: new Date(Date.now() + 60_000)
        });
        const parts = token.split('.');
        const signature = parts[2] || '';
        const tamperedSignature = `${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`;
        const tampered = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

        expect(verifySandboxApiKeyToken({ token: tampered, signingSecret })).toBeNull();
    });

    it('rejects malformed tokens', () => {
        expect(parseSandboxApiKeyToken('not-a-token')).toBeNull();
        expect(parseSandboxApiKeyToken(`${sandboxApiKeyPrefix}bad`)).toBeNull();
    });

    it('keeps parent scopes and adds sandbox baseline scopes', () => {
        expect(buildSandboxApiKeyScopes(['environment:dryrun', 'environment:records:read'])).toStrictEqual([
            'environment:dryrun',
            'environment:records:read',
            'environment:connections:read',
            'environment:integrations:read',
            'environment:proxy'
        ]);
    });

    it('does not duplicate baseline scopes already present on the parent key', () => {
        expect(buildSandboxApiKeyScopes(['environment:dryrun', 'environment:proxy'])).toStrictEqual([
            'environment:dryrun',
            'environment:proxy',
            'environment:connections:read',
            'environment:integrations:read'
        ]);
    });
});
