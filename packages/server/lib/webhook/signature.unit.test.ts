import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { safeCompare, validateHmacSignature, validateSvixSignature } from './signature.js';

describe('safeCompare', () => {
    it('matches identical strings', () => {
        expect(safeCompare('abc', 'abc')).toBe(true);
    });

    it('does not throw on mismatched lengths', () => {
        expect(safeCompare('abc', 'abcdef')).toBe(false);
    });

    it('rejects an empty expected value', () => {
        expect(safeCompare('', '')).toBe(false);
    });

    it('compares hex encoded values', () => {
        expect(safeCompare('deadbeef', 'deadbeef', 'hex')).toBe(true);
        expect(safeCompare('deadbeef', 'deadbeee', 'hex')).toBe(false);
    });
});

describe('validateHmacSignature', () => {
    const secret = 'top-secret';
    const rawBody = '{"hello":"world"}';

    it('accepts a hex sha256 signature', () => {
        const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

        expect(validateHmacSignature({ secret, rawBody, signature })).toBe(true);
    });

    it('accepts a prefixed signature', () => {
        const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

        expect(validateHmacSignature({ secret, rawBody, signature, prefix: 'sha256=' })).toBe(true);
    });

    it('accepts a base64 sha1 signature', () => {
        const signature = crypto.createHmac('sha1', secret).update(rawBody).digest('base64');

        expect(validateHmacSignature({ secret, rawBody, signature, algorithm: 'sha1', digest: 'base64' })).toBe(true);
    });

    it('rejects a signature over a different body', () => {
        const signature = crypto.createHmac('sha256', secret).update('other').digest('hex');

        expect(validateHmacSignature({ secret, rawBody, signature })).toBe(false);
    });

    it('rejects a signature made with a different secret', () => {
        const signature = crypto.createHmac('sha256', 'wrong').update(rawBody).digest('hex');

        expect(validateHmacSignature({ secret, rawBody, signature })).toBe(false);
    });

    it('rejects an empty secret', () => {
        const signature = crypto.createHmac('sha256', '').update(rawBody).digest('hex');

        expect(validateHmacSignature({ secret: '', rawBody, signature })).toBe(false);
    });

    it('rejects a missing signature', () => {
        expect(validateHmacSignature({ secret, rawBody, signature: '' })).toBe(false);
    });

    it('rejects a truncated signature without throwing', () => {
        const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex').slice(0, 10);

        expect(validateHmacSignature({ secret, rawBody, signature })).toBe(false);
    });
});

describe('validateSvixSignature', () => {
    // Base64 of "not-a-real-secret-only-for-tests". Kept separate from the prefix so the source
    // never contains a contiguous `whsec_`-prefixed key for secret scanners to flag.
    const KEY = 'bm90LWEtcmVhbC1zZWNyZXQtb25seS1mb3ItdGVzdHM=';
    const secret = `whsec_${KEY}`;
    const rawBody = '{"event":"created"}';

    function sign(id: string, timestamp: number, body: string): string {
        const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
        return `v1,${crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
    }

    function headersFor(overrides: Record<string, any> = {}) {
        const timestamp = Math.floor(Date.now() / 1000);
        return {
            'webhook-id': 'msg_1',
            'webhook-timestamp': String(timestamp),
            'webhook-signature': sign('msg_1', timestamp, rawBody),
            ...overrides
        };
    }

    it('accepts a valid signature', () => {
        expect(validateSvixSignature({ secret, headers: headersFor(), rawBody })).toBe('valid');
    });

    it('accepts svix prefixed headers', () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const headers = {
            'svix-id': 'msg_1',
            'svix-timestamp': String(timestamp),
            'svix-signature': sign('msg_1', timestamp, rawBody)
        };

        expect(validateSvixSignature({ secret, headers, rawBody })).toBe('valid');
    });

    it('accepts a secret with no whsec_ prefix', () => {
        const bare = secret.replace(/^whsec_/, '');

        expect(validateSvixSignature({ secret: bare, headers: headersFor(), rawBody })).toBe('valid');
    });

    it('picks a matching signature out of a space separated list', () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const headers = headersFor({
            'webhook-timestamp': String(timestamp),
            'webhook-signature': `v1,bogus ${sign('msg_1', timestamp, rawBody)}`
        });

        expect(validateSvixSignature({ secret, headers, rawBody })).toBe('valid');
    });

    it('accepts a non canonical timestamp the sender signed verbatim', () => {
        // Number() would normalise the leading zero and rebuild a payload the sender never signed.
        const timestamp = Math.floor(Date.now() / 1000);
        const raw = `0${timestamp}`;
        const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
        const signature = `v1,${crypto.createHmac('sha256', key).update(`msg_1.${raw}.${rawBody}`).digest('base64')}`;

        const headers = { 'webhook-id': 'msg_1', 'webhook-timestamp': raw, 'webhook-signature': signature };

        expect(validateSvixSignature({ secret, headers, rawBody })).toBe('valid');
    });

    it('rejects a key shorter than the minimum even when the signature matches', () => {
        // A three byte key would be brute forceable. Providers issue 24 bytes (svix) or 32
        // (gitlab), so nothing legitimate lands under the floor.
        const shortSecret = 'whsec_abcd';
        const timestamp = Math.floor(Date.now() / 1000);
        const key = Buffer.from('abcd', 'base64');
        const signature = `v1,${crypto.createHmac('sha256', key).update(`msg_1.${timestamp}.${rawBody}`).digest('base64')}`;
        const headers = { 'webhook-id': 'msg_1', 'webhook-timestamp': String(timestamp), 'webhook-signature': signature };

        expect(validateSvixSignature({ secret: shortSecret, headers, rawBody })).toBe('invalid');
    });

    it('accepts a 24 byte svix key', () => {
        // 24 bytes is 32 base64 characters, which is easy to mistake for 32 bytes. The floor must
        // not reject it.
        const key = Buffer.alloc(24, 3);
        const bare = key.toString('base64');
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = `v1,${crypto.createHmac('sha256', key).update(`msg_1.${timestamp}.${rawBody}`).digest('base64')}`;
        const headers = { 'webhook-id': 'msg_1', 'webhook-timestamp': String(timestamp), 'webhook-signature': signature };

        expect(validateSvixSignature({ secret: `whsec_${bare}`, headers, rawBody })).toBe('valid');
    });

    it('reports missing headers', () => {
        expect(validateSvixSignature({ secret, headers: {}, rawBody })).toBe('missing_headers');
    });

    it('rejects a stale timestamp', () => {
        const stale = Math.floor(Date.now() / 1000) - 60 * 60;
        const headers = headersFor({ 'webhook-timestamp': String(stale), 'webhook-signature': sign('msg_1', stale, rawBody) });

        expect(validateSvixSignature({ secret, headers, rawBody })).toBe('stale_timestamp');
    });

    it('rejects a non numeric timestamp', () => {
        expect(validateSvixSignature({ secret, headers: headersFor({ 'webhook-timestamp': 'nope' }), rawBody })).toBe('stale_timestamp');
    });

    it('rejects a signature over a different body', () => {
        expect(validateSvixSignature({ secret, headers: headersFor(), rawBody: '{"event":"tampered"}' })).toBe('invalid');
    });

    it('rejects a signature bound to a different message id', () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const headers = headersFor({ 'webhook-timestamp': String(timestamp), 'webhook-signature': sign('msg_other', timestamp, rawBody) });

        expect(validateSvixSignature({ secret, headers, rawBody })).toBe('invalid');
    });
});
