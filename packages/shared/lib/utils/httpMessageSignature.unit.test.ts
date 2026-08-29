import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { getProvider } from '@nangohq/providers';

import { interpolateStringFromObject } from './utils.js';

describe('RFC 9421 / Ed25519 signature interpolation (sha256Base64 + ed25519Sign)', () => {
    it('produces headers whose signature verifies against the reconstructed message', () => {
        const provider = getProvider('streamline-ai');
        if (!provider || !('proxy' in provider) || !provider.proxy?.headers) {
            throw new Error('streamline-ai provider or its proxy.headers are missing');
        }
        const headerTemplates = provider.proxy.headers;

        const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
        const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

        const replacers = {
            credentials: { username: 'slak_test123', password: privateKeyPem },
            method: 'POST',
            host: 'acme.streamline.ai',
            // `endpoint` is the raw path a caller passes to the proxy; `path` is the actual resolved
            // pathname (including the provider's base_url prefix) that the request is sent to. They
            // differ here on purpose so the signature (which must sign `path`) is verified against
            // the real outbound URL, not against a caller-supplied path that omits the base_url prefix.
            endpoint: '/v0/requests',
            path: '/api/v0/requests',
            now: '2026-08-12T00:00:00.000Z',
            bodyCanonicalParams: JSON.stringify({ requestFormId: 'requestform_1', status: 'submitted' })
        };

        const headers: Record<string, string> = {};
        for (const [key, template] of Object.entries(headerTemplates)) {
            if (typeof template !== 'string') {
                continue;
            }
            headers[key] = interpolateStringFromObject(template, replacers);
        }

        for (const [key, value] of Object.entries(headers)) {
            expect(value, `header ${key} should be fully resolved`).not.toMatch(/\$\{/);
        }

        expect(headers['authorization']).toBe('Signature keyid="slak_test123"');

        expect(headers['content-digest']).toBe(`sha-256=:${crypto.createHash('sha256').update(replacers.bodyCanonicalParams, 'utf8').digest('base64')}:`);

        const sigInputMatch = headers['signature-input']!.match(/^sig=\((.+)\);alg="ed25519";created=(\d+);expires=(\d+);keyid="(.+)"$/);
        expect(sigInputMatch).not.toBeNull();
        const [, , created, expires, keyid] = sigInputMatch!;
        expect(keyid).toBe('slak_test123');

        const reconstructedMessage =
            `"@method": ${replacers.method}\n` +
            `"@target-uri": https://${replacers.host}${replacers.path}\n` +
            `"content-digest": ${headers['content-digest']}\n` +
            `"content-type": application/json\n` +
            `"@signature-params": ("@method" "@target-uri" "content-digest" "content-type");alg="ed25519";created=${created};expires=${expires};keyid="${keyid}"`;

        const sigMatch = headers['signature']!.match(/^sig=:(.+):$/);
        expect(sigMatch).not.toBeNull();
        const signatureB64 = sigMatch![1]!;

        const verified = crypto.verify(null, Buffer.from(reconstructedMessage, 'utf8'), publicKey, Buffer.from(signatureB64, 'base64'));
        expect(verified).toBe(true);

        expect(Number(expires) - Number(created)).toBe(60);
    });
});
