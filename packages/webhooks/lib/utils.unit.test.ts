import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { axiosInstance, stringifyStable } from '@nangohq/utils';

import { allowAllWebhookOutbound } from './helpers/setup.unit.js';
import { TestWebhookServer } from './helpers/test.js';
import { deliver, getHmacSignatureHeader, getSignatureHeaderUnsafe } from './utils.js';

import type { DBAPISecret } from '@nangohq/types';
import type { AxiosResponse } from 'axios';
import type { MockInstance } from 'vitest';

describe('getSignatureHeaderUnsafe', () => {
    it('should return a string', () => {
        const secret = 'secret';
        const payload = 'payload';
        const signature = getSignatureHeaderUnsafe(secret, payload);
        expect(signature).toBe('22439a879b090cd05e5b51c5b5d7e4a205830e6ab4f54b90f5a822b7c7110934');
    });

    it('should return the same signature for the same payload but different order', () => {
        const secret = 'secret';
        const signature1 = getSignatureHeaderUnsafe(secret, stringifyStable({ a: 1, b: 2 }).unwrap());
        const signature2 = getSignatureHeaderUnsafe(secret, stringifyStable({ b: 2, a: 1 }).unwrap());
        expect(signature1).toBe(signature2);
    });
});

describe('getHmacSignatureHeader', () => {
    it('should return a string', () => {
        const secret = 'secret';
        const payload = 'payload';
        const signature = getHmacSignatureHeader(secret, payload);
        expect(signature).toBe('b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4');
    });

    it('should return the same signature for the same payload but different order', () => {
        const secret = 'secret';
        const signature1 = getHmacSignatureHeader(secret, stringifyStable({ a: 1, b: 2 }).unwrap());
        const signature2 = getHmacSignatureHeader(secret, stringifyStable({ b: 2, a: 1 }).unwrap());
        expect(signature1).toBe(signature2);
    });

    it('should return a different signature from getSignatureHeaderUnsafe', () => {
        const secret = 'secret';
        const payload = 'payload';
        const safeSignature = getHmacSignatureHeader(secret, payload);
        const unsafeSignature = getSignatureHeaderUnsafe(secret, payload);
        expect(safeSignature).not.toEqual(unsafeSignature);
    });
});

describe('deliver request shape', () => {
    const secret = 'secret' as DBAPISecret['secret'];
    const allowAll = allowAllWebhookOutbound();
    const okResponse = { status: 200, statusText: 'OK', headers: {}, data: { ok: true }, config: {} } as unknown as AxiosResponse;

    let postSpy: MockInstance<typeof axiosInstance.post>;

    beforeEach(() => {
        postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValue(okResponse);
    });

    afterEach(() => {
        postSpy.mockRestore();
    });

    it('POSTs once per webhook URL with the stable body and signed headers', async () => {
        const body = { hello: 'world' };
        const result = await deliver({
            webhooks: [
                { url: 'https://example.com/primary', type: 'primary' },
                { url: 'https://example.com/secondary', type: 'secondary' }
            ],
            body,
            webhookType: 'forward',
            secret,
            outbound: allowAll
        });

        expect(result.isOk()).toBe(true);
        expect(postSpy).toHaveBeenCalledTimes(2);

        const bodyString = stringifyStable(body).unwrap();
        const expectedHeaders = {
            'X-Nango-Signature': expect.toBeSha256(),
            'X-Nango-Hmac-Sha256': expect.toBeSha256(),
            'content-type': 'application/json',
            'user-agent': expect.stringContaining('nango/')
        };

        expect(postSpy).toHaveBeenNthCalledWith(1, 'https://example.com/primary', bodyString, expect.objectContaining({ headers: expectedHeaders }));
        expect(postSpy).toHaveBeenNthCalledWith(2, 'https://example.com/secondary', bodyString, expect.objectContaining({ headers: expectedHeaders }));
    });

    it('caps redirects and attaches the outbound agents from the transport', async () => {
        await deliver({
            webhooks: [{ url: 'https://example.com/primary', type: 'primary' }],
            body: { hello: 'world' },
            webhookType: 'forward',
            secret,
            outbound: allowAll
        });

        expect(postSpy).toHaveBeenCalledTimes(1);
        const config = postSpy.mock.calls[0]![2]!;
        expect(config.maxRedirects).toBe(allowAll.policy.maxRedirects);
        expect(config.httpAgent).toBe(allowAll.agents.httpAgent);
        expect(config.httpsAgent).toBe(allowAll.agents.httpsAgent);
    });
});

describe('deliver bytes metering', () => {
    const testServer = new TestWebhookServer(4104);
    const secret = 'test-secret' as DBAPISecret['secret'];
    // Permissive transport so we can reach the loopback test server (the real policy blocks loopback).
    const allowAll = allowAllWebhookOutbound();

    beforeAll(async () => {
        await testServer.start();
    });

    afterAll(async () => {
        await testServer.stop();
    });

    it('should fire onBytes with non-zero sent on successful POST', async () => {
        const hops: { sent: number; received: number }[] = [];
        const result = await deliver({
            webhooks: [{ url: testServer.primaryUrl, type: 'primary' }],
            body: { hello: 'world' },
            webhookType: 'forward',
            secret,
            outbound: allowAll,
            onBytes: (b) => hops.push(b)
        });
        expect(result.isOk()).toBe(true);
        expect(hops.length).toBe(1);
        expect(hops[0]!.sent).toBeGreaterThan(0);
    });

    it('should fire onBytes once per webhook URL', async () => {
        const hops: { sent: number; received: number }[] = [];
        await deliver({
            webhooks: [
                { url: testServer.primaryUrl, type: 'primary' },
                { url: testServer.secondaryUrl, type: 'secondary' }
            ],
            body: { hello: 'world' },
            webhookType: 'forward',
            secret,
            outbound: allowAll,
            onBytes: (b) => hops.push(b)
        });
        expect(hops.length).toBe(2);
        for (const h of hops) {
            expect(h.sent).toBeGreaterThan(0);
        }
    });

    // No `outbound` override here: exercise the real env-derived policy so the SSRF checks actually run.
    it('should skip denylisted webhook URLs', async () => {
        const hops: { sent: number; received: number }[] = [];
        const result = await deliver({
            webhooks: [{ url: 'http://169.254.169.254/webhook', type: 'primary' }],
            body: { hello: 'world' },
            webhookType: 'forward',
            secret,
            onBytes: (b) => hops.push(b)
        });
        expect(result.isOk()).toBe(true);
        expect(hops.length).toBe(0);
    });

    it('should skip webhook URLs pointing at private (RFC1918) IP literals', async () => {
        const hops: { sent: number; received: number }[] = [];
        const result = await deliver({
            webhooks: [{ url: 'http://10.0.0.1/webhook', type: 'primary' }],
            body: { hello: 'world' },
            webhookType: 'forward',
            secret,
            onBytes: (b) => hops.push(b)
        });
        expect(result.isOk()).toBe(true);
        expect(hops.length).toBe(0);
    });
});
