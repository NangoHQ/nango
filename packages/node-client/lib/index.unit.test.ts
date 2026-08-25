import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Nango } from './index.js';

import type { NangoProps } from './types.js';

describe('triggerSync', () => {
    const nango = new Nango({ secretKey: 'test' });
    const mockHttp = {
        post: vi.fn()
    };
    // @ts-expect-error - we're mocking the http instance
    nango.http = mockHttp;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle sync_mode as a string', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], undefined, 'full_refresh');

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                sync_mode: 'full_refresh'
            },
            expect.any(Object)
        );
    });

    it('should handle sync_mode as a boolean (true)', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], undefined, true);

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                sync_mode: 'full_refresh'
            },
            expect.any(Object)
        );
    });

    it('should handle sync_mode as a boolean (false)', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], undefined, false);

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                sync_mode: 'incremental'
            },
            expect.any(Object)
        );
    });

    it('should handle opts with reset: true', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], 'conn-123', { reset: true });

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: 'conn-123',
                opts: { reset: true }
            },
            expect.any(Object)
        );
    });

    it('should handle opts with emptyCache: true', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], undefined, { emptyCache: true });

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                opts: { emptyCache: true }
            },
            expect.any(Object)
        );
    });

    it('should handle opts with both reset and emptyCache', async () => {
        await nango.triggerSync('test-provider', ['test-sync'], undefined, { reset: true, emptyCache: true });

        expect(mockHttp.post).toHaveBeenCalledWith(
            expect.any(String),
            {
                syncs: ['test-sync'],
                provider_config_key: 'test-provider',
                connection_id: undefined,
                opts: { reset: true, emptyCache: true }
            },
            expect.any(Object)
        );
    });
});

describe('listConnections', () => {
    const nango = new Nango({ secretKey: 'test', host: 'https://example.com' });
    const mockHttp = {
        get: vi.fn()
    };

    // @ts-expect-error - we're mocking the http instance
    nango.http = mockHttp;

    beforeEach(() => {
        vi.clearAllMocks();
        mockHttp.get.mockResolvedValue({ data: { connections: [] } });
    });

    it('should serialize displayName/email tags as connection tag filters', async () => {
        await nango.listConnections({
            tags: { displayName: 'My User', email: 'user@example.com' }
        });

        expect(mockHttp.get).toHaveBeenCalledOnce();

        const calledUrl = mockHttp.get.mock.calls[0]?.[0] as string;
        const url = new URL(calledUrl);

        expect(url.pathname).toBe('/connections');

        expect(url.searchParams.get('tags[end_user_display_name]')).toBe('My User');
        expect(url.searchParams.get('tags[end_user_email]')).toBe('user@example.com');

        expect(url.searchParams.has('search')).toBe(false);
        expect(url.searchParams.has('email')).toBe(false);
    });

    it('should serialize arbitrary tags using tags[...] query params', async () => {
        await nango.listConnections({
            tags: { Foo: 'Bar' }
        });

        const calledUrl = mockHttp.get.mock.calls[0]?.[0] as string;
        const url = new URL(calledUrl);

        expect(url.searchParams.get('tags[foo]')).toBe('Bar');
    });
});

describe('verifySignature', () => {
    it('should verify an untampered payload', () => {
        const secretKey = 'test-secret-key';
        const nango = new Nango({ secretKey });

        const body = {
            type: 'sync',
            connectionId: 'test-connection',
            providerConfigKey: 'test-provider',
            syncName: 'test-sync',
            model: 'TestModel',
            responseResults: { added: 5, updated: 0, deleted: 0 }
        };

        const bodyString = JSON.stringify(body);
        const signature = crypto.createHash('sha256').update(`${secretKey}${bodyString}`).digest('hex');
        const isValid = nango.verifyWebhookSignature(signature, body);
        expect(isValid).toBe(true);
    });
});

describe('verifyIncomingWebhookRequest', () => {
    const secretKey = 'test-secret-key';
    const nango = new Nango({ secretKey });

    let body = {};
    let bodyString: string;
    let oldSignature: string;
    let hmacSignature: string;

    beforeEach(() => {
        body = {
            type: 'sync',
            connectionId: 'test-connection',
            providerConfigKey: 'test-provider',
            syncName: 'test-sync',
            model: 'TestModel',
            responseResults: { added: 5, updated: 0, deleted: 0 }
        };
        bodyString = JSON.stringify(body);
        oldSignature = crypto.createHash('sha256').update(`${secretKey}${bodyString}`).digest('hex');
        hmacSignature = crypto.createHmac('sha256', secretKey).update(bodyString).digest('hex');
    });

    it('should use the X-Nango-Hmac-Sha256 header to verify webhook', () => {
        const headers = {
            'x-nango-signature': oldSignature,
            'x-nango-hmac-sha256': hmacSignature,
            'content-type': 'application/json',
            'user-agent': 'nango/1.0.0'
        };

        const isValid = nango.verifyIncomingWebhookRequest(bodyString, headers);

        expect(isValid).toBe(true);
    });

    it('should return false when X-Nango-Hmac-Sha256 signature is invalid', () => {
        const headers = {
            'x-nango-hmac-sha256': 'invalid-signature',
            'content-type': 'application/json',
            'user-agent': 'nango/1.0.0'
        };

        const isValid = nango.verifyIncomingWebhookRequest(bodyString, headers);

        expect(isValid).toBe(false);
    });

    it('should return false when X-Nango-Hmac-Sha256 header is missing (even if X-Nango-Signature is present)', () => {
        const headers = {
            'x-nango-signature': oldSignature,
            'content-type': 'application/json',
            'user-agent': 'nango/1.0.0'
        };

        const isValid = nango.verifyIncomingWebhookRequest(bodyString, headers);

        expect(isValid).toBe(false);
    });

    it('should handle case-insensitive header names', () => {
        const headersUpperCase = {
            'X-Nango-Hmac-Sha256': hmacSignature,
            'Content-Type': 'application/json'
        };

        const headersMixedCase = {
            'X-NANGO-HMAC-SHA256': hmacSignature,
            'content-type': 'application/json'
        };

        const headersLowerCase = {
            'x-nango-hmac-sha256': hmacSignature,
            'content-type': 'application/json'
        };

        expect(nango.verifyIncomingWebhookRequest(bodyString, headersUpperCase)).toBe(true);
        expect(nango.verifyIncomingWebhookRequest(bodyString, headersMixedCase)).toBe(true);
        expect(nango.verifyIncomingWebhookRequest(bodyString, headersLowerCase)).toBe(true);
    });
});

describe('verifyIncomingWebhookRequest with a separate webhook signing key', () => {
    const secretKey = 'test-secret-key';
    const webhookSigningKey = 'test-webhook-signing-key';

    const body = {
        type: 'sync',
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
        syncName: 'test-sync',
        model: 'TestModel',
        responseResults: { added: 5, updated: 0, deleted: 0 }
    };
    const bodyString = JSON.stringify(body);
    const signatureFromSigningKey = crypto.createHmac('sha256', webhookSigningKey).update(bodyString).digest('hex');
    const signatureFromSecretKey = crypto.createHmac('sha256', secretKey).update(bodyString).digest('hex');

    it('should verify webhooks signed with the webhook signing key', () => {
        const nango = new Nango({ secretKey, webhookSigningKey });

        expect(nango.verifyIncomingWebhookRequest(bodyString, { 'x-nango-hmac-sha256': signatureFromSigningKey })).toBe(true);
    });

    it('should reject webhooks signed with the secret key when a webhook signing key is set', () => {
        const nango = new Nango({ secretKey, webhookSigningKey });

        expect(nango.verifyIncomingWebhookRequest(bodyString, { 'x-nango-hmac-sha256': signatureFromSecretKey })).toBe(false);
    });

    it('should fall back to the secret key when no webhook signing key is set', () => {
        const nango = new Nango({ secretKey });

        expect(nango.verifyIncomingWebhookRequest(bodyString, { 'x-nango-hmac-sha256': signatureFromSecretKey })).toBe(true);
    });
});

describe('apiKey / secretKey', () => {
    it('should accept apiKey and use it as the bearer token', () => {
        const apiKey = 'test-api-key';
        const nango = new Nango({ apiKey });

        expect(nango.apiKey).toBe(apiKey);
        expect(nango.secretKey).toBeUndefined();
    });

    it('should not use the apiKey to verify webhooks (must set webhookSigningKey)', () => {
        const apiKey = 'test-api-key';
        const nango = new Nango({ apiKey });

        const body = JSON.stringify({ type: 'sync' });
        const signature = crypto.createHmac('sha256', apiKey).update(body).digest('hex');
        // No webhookSigningKey and no deprecated secretKey, so there is no signing key to fall back to.
        expect(nango.verifyIncomingWebhookRequest(body, { 'x-nango-hmac-sha256': signature })).toBe(false);
    });

    it('should verify webhooks with webhookSigningKey when constructed with apiKey', () => {
        const nango = new Nango({ apiKey: 'test-api-key', webhookSigningKey: 'test-signing-key' });

        const body = JSON.stringify({ type: 'sync' });
        const signature = crypto.createHmac('sha256', 'test-signing-key').update(body).digest('hex');
        expect(nango.verifyIncomingWebhookRequest(body, { 'x-nango-hmac-sha256': signature })).toBe(true);
    });

    it('should still accept the deprecated secretKey for both the bearer token and webhook fallback', () => {
        const secretKey = 'test-secret-key';
        const nango = new Nango({ secretKey });

        expect(nango.apiKey).toBe(secretKey);
        expect(nango.secretKey).toBe(secretKey);

        const body = JSON.stringify({ type: 'sync' });
        const signature = crypto.createHmac('sha256', secretKey).update(body).digest('hex');
        expect(nango.verifyIncomingWebhookRequest(body, { 'x-nango-hmac-sha256': signature })).toBe(true);
    });

    it('should throw when both apiKey and secretKey are provided', () => {
        // The type forbids passing both (XOR); cast to exercise the runtime guard for JS callers.
        expect(() => new Nango({ apiKey: 'the-api-key', secretKey: 'the-secret-key' } as unknown as NangoProps)).toThrow(/not both/);
    });

    it('should throw when neither apiKey nor secretKey is provided', () => {
        // The type requires at least one credential; cast to exercise the runtime guard defensively.
        expect(() => new Nango({} as unknown as NangoProps)).toThrow(/API key/);
    });
});
