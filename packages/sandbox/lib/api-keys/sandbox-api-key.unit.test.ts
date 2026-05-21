import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import {
    buildSandboxApiKeyScopes,
    createSandboxApiKeyToken,
    createSandboxSigningSecret,
    isSandboxApiKey,
    parseSandboxApiKeyToken,
    sandboxApiKeyAudience,
    sandboxApiKeyPrefix,
    verifySandboxApiKeyToken
} from './sandbox-api-key.service.js';

describe('customer key sandbox token service', () => {
    it('creates and verifies a sandbox API key token', () => {
        const signingSecret = createSandboxSigningSecret();
        const issuedAt = Date.now();
        const expiresAt = new Date(Date.now() + 60_000);
        const token = createSandboxApiKeyToken({
            parentApiKeyId: 123,
            signingSecret,
            purpose: 'dryrun',
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
            aud: sandboxApiKeyAudience,
            purpose: 'dryrun',
            iat: Math.floor(issuedAt / 1000),
            exp: Math.ceil(expiresAt.getTime() / 1000)
        });
        expect(verifySandboxApiKeyToken({ token, signingSecret })).toMatchObject({ kid: 123, aud: sandboxApiKeyAudience, purpose: 'dryrun' });
    });

    it('rejects expired tokens', () => {
        const signingSecret = createSandboxSigningSecret();
        const now = Date.now();
        const token = createSandboxApiKeyToken({
            parentApiKeyId: 123,
            signingSecret,
            purpose: 'dryrun',
            expiresAt: new Date(now - 1_000),
            issuedAt: now - 60_000
        });

        expect(verifySandboxApiKeyToken({ token, signingSecret })).toBeNull();
    });

    it('rejects token creation when expiresAt is not in the future', () => {
        const signingSecret = createSandboxSigningSecret();
        const issuedAt = Date.now();

        expect(() =>
            createSandboxApiKeyToken({
                parentApiKeyId: 123,
                signingSecret,
                purpose: 'dryrun',
                expiresAt: new Date(issuedAt),
                issuedAt
            })
        ).toThrow('Sandbox API key expiresAt must be in the future');
    });

    it('rejects tampered signatures', () => {
        const signingSecret = createSandboxSigningSecret();
        const token = createSandboxApiKeyToken({
            parentApiKeyId: 123,
            signingSecret,
            purpose: 'dryrun',
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

    it('rejects tokens with the wrong audience or purpose', () => {
        const signingSecret = createSandboxSigningSecret();
        const payload = {
            iat: Math.floor(Date.now() / 1000),
            exp: Math.ceil((Date.now() + 60_000) / 1000)
        };

        const wrongAudience = jwt.sign({ ...payload, aud: 'other', purpose: 'dryrun' }, signingSecret, {
            algorithm: 'HS256',
            header: { typ: 'JWT', alg: 'HS256', kid: '123' }
        });
        const wrongPurpose = jwt.sign({ ...payload, aud: sandboxApiKeyAudience, purpose: 'other' }, signingSecret, {
            algorithm: 'HS256',
            header: { typ: 'JWT', alg: 'HS256', kid: '123' }
        });

        expect(verifySandboxApiKeyToken({ token: `${sandboxApiKeyPrefix}${wrongAudience}`, signingSecret })).toBeNull();
        expect(verifySandboxApiKeyToken({ token: `${sandboxApiKeyPrefix}${wrongPurpose}`, signingSecret })).toBeNull();
    });

    it('rejects non-canonical parent API key ids', () => {
        const signingSecret = createSandboxSigningSecret();
        const payload = { iat: Math.floor(Date.now() / 1000), exp: Math.ceil((Date.now() + 60_000) / 1000) };

        for (const kid of ['01', '1.0', '1e3', '9007199254740992']) {
            const token = jwt.sign(payload, signingSecret, {
                algorithm: 'HS256',
                header: { typ: 'JWT', alg: 'HS256', kid }
            });

            expect(parseSandboxApiKeyToken(`${sandboxApiKeyPrefix}${token}`)).toBeNull();
        }
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
