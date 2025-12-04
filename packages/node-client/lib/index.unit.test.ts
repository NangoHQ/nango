import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Nango } from './index.js';

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

    it('should default to incremental sync_mode when not provided', async () => {
        await nango.triggerSync('test-provider', ['test-sync']);

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
