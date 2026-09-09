import { describe, expect, it } from 'vitest';

import { createArtifactCrypto } from './crypto.js';

describe('OAuth artifact crypto', () => {
    it('encrypts and decrypts payloads without exposing plaintext', () => {
        const crypto = createArtifactCrypto(Buffer.alloc(32, 's').toString('base64'));
        const idHash = crypto.hash('opaque-token');
        const encrypted = crypto.encrypt('AccessToken', idHash, { jti: 'opaque-token', scope: 'environment:*' });

        expect(encrypted.toString()).not.toContain('opaque-token');
        expect(crypto.decrypt('AccessToken', idHash, encrypted)).toStrictEqual({ jti: 'opaque-token', scope: 'environment:*' });
    });

    it('fails to decrypt with a different model or identifier hash', () => {
        const crypto = createArtifactCrypto(Buffer.alloc(32, 's').toString('base64'));
        const idHash = crypto.hash('opaque-token');
        const encrypted = crypto.encrypt('AccessToken', idHash, { value: true });

        expect(() => crypto.decrypt('RefreshToken', idHash, encrypted)).toThrow();
        expect(() => crypto.decrypt('AccessToken', crypto.hash('other-token'), encrypted)).toThrow();
    });
});
