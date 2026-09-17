import { describe, expect, it } from 'vitest';

import { createArtifactCrypto } from './crypto.js';

describe('OAuth artifact crypto', () => {
    it('encrypts and decrypts payloads without exposing plaintext', async () => {
        const crypto = createArtifactCrypto(Buffer.alloc(32, 's').toString('base64'));
        const idHash = crypto.hash('opaque-token');
        const encrypted = await crypto.encrypt('AccessToken', idHash, { jti: 'opaque-token', scope: 'environment:*' });

        expect(encrypted.toString()).not.toContain('opaque-token');
        await expect(crypto.decrypt('AccessToken', idHash, encrypted)).resolves.toStrictEqual({ jti: 'opaque-token', scope: 'environment:*' });
    });

    it('fails to decrypt with a different model or identifier hash', async () => {
        const crypto = createArtifactCrypto(Buffer.alloc(32, 's').toString('base64'));
        const idHash = crypto.hash('opaque-token');
        const encrypted = await crypto.encrypt('AccessToken', idHash, { value: true });

        await expect(crypto.decrypt('RefreshToken', idHash, encrypted)).rejects.toThrow();
        await expect(crypto.decrypt('AccessToken', crypto.hash('other-token'), encrypted)).rejects.toThrow();
    });

    it('fails to decrypt a tampered ciphertext', async () => {
        const crypto = createArtifactCrypto(Buffer.alloc(32, 's').toString('base64'));
        const idHash = crypto.hash('opaque-token');
        const encrypted = await crypto.encrypt('AccessToken', idHash, { value: true });
        const jwe = JSON.parse(encrypted.toString('utf8')) as { ciphertext: string };
        jwe.ciphertext = `${jwe.ciphertext[0] === 'A' ? 'B' : 'A'}${jwe.ciphertext.slice(1)}`;

        await expect(crypto.decrypt('AccessToken', idHash, Buffer.from(JSON.stringify(jwe), 'utf8'))).rejects.toThrow();
    });
});
