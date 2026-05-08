import { RateLimiterMemory } from 'rate-limiter-flexible';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWebhookIngressRateLimit } from './webhook-ingress-ratelimit.middleware.js';

import type { NextFunction, Request, Response } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const ANOTHER_UUID = '22222222-2222-4222-8222-222222222222';

function makeReq(params: Record<string, string | undefined>): Request {
    return { params } as unknown as Request;
}

function makeRes() {
    const headers: Record<string, unknown> = {};
    let statusCode: number | undefined;
    let body: unknown;
    const res = {
        setHeader: (name: string, value: unknown) => {
            headers[name] = value;
            return res;
        },
        status: (code: number) => {
            statusCode = code;
            return res;
        },
        send: (payload: unknown) => {
            body = payload;
            return res;
        }
    };
    return {
        res: res as unknown as Response,
        getHeaders: () => headers,
        getStatusCode: () => statusCode,
        getBody: () => body
    };
}

function makeLimiter(points: number): RateLimiterAbstract {
    return new RateLimiterMemory({
        keyPrefix: 'test-webhook-ingress',
        points,
        duration: 60,
        blockDuration: 0
    });
}

describe('webhookIngressRateLimit middleware', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = vi.fn();
    });

    it('passes through when limit is 0 (disabled)', async () => {
        const getLimiter = vi.fn();
        const middleware = createWebhookIngressRateLimit({ limit: 0, enforce: true, getLimiter });
        const { res } = makeRes();

        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(getLimiter).not.toHaveBeenCalled();
    });

    it('passes through when environmentUuid is not a UUID v4', async () => {
        const getLimiter = vi.fn();
        const middleware = createWebhookIngressRateLimit({ limit: 5, enforce: true, getLimiter });
        const { res } = makeRes();

        await middleware(makeReq({ environmentUuid: 'not-a-uuid', providerConfigKey: 'github' }), res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(getLimiter).not.toHaveBeenCalled();
    });

    it('passes through when providerConfigKey is missing', async () => {
        const getLimiter = vi.fn();
        const middleware = createWebhookIngressRateLimit({ limit: 5, enforce: true, getLimiter });
        const { res } = makeRes();

        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: undefined }), res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(getLimiter).not.toHaveBeenCalled();
    });

    it('allows requests within the limit and breaches on N+1', async () => {
        const limiter = makeLimiter(2);
        const middleware = createWebhookIngressRateLimit({
            limit: 2,
            enforce: false,
            getLimiter: () => Promise.resolve(limiter)
        });

        for (let i = 0; i < 2; i++) {
            const { res } = makeRes();
            const localNext = vi.fn();
            await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, localNext);
            expect(localNext).toHaveBeenCalledOnce();
        }

        // 3rd request — over the limit
        const { res, getStatusCode } = makeRes();
        const localNext = vi.fn();
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, localNext);
        // shadow mode by default — falls through
        expect(localNext).toHaveBeenCalledOnce();
        expect(getStatusCode()).toBeUndefined();
    });

    it('different keys do not share a budget', async () => {
        const limiter = makeLimiter(1);
        const middleware = createWebhookIngressRateLimit({
            limit: 1,
            enforce: false,
            getLimiter: () => Promise.resolve(limiter)
        });

        // First key consumes its single point
        let { res } = makeRes();
        let localNext = vi.fn();
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, localNext);
        expect(localNext).toHaveBeenCalledOnce();

        // Different env uuid, same provider config — independent budget
        ({ res } = makeRes());
        localNext = vi.fn();
        await middleware(makeReq({ environmentUuid: ANOTHER_UUID, providerConfigKey: 'github' }), res, localNext);
        expect(localNext).toHaveBeenCalledOnce();

        // Same env uuid, different provider config — independent budget
        ({ res } = makeRes());
        localNext = vi.fn();
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'slack' }), res, localNext);
        expect(localNext).toHaveBeenCalledOnce();
    });

    it('shadow mode: breach is observed but request continues', async () => {
        const limiter = makeLimiter(1);
        const middleware = createWebhookIngressRateLimit({
            limit: 1,
            enforce: false,
            getLimiter: () => Promise.resolve(limiter)
        });

        // consume the only point
        const { res } = makeRes();
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, vi.fn());

        // breach
        const second = makeRes();
        const localNext = vi.fn();
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), second.res, localNext);

        expect(localNext).toHaveBeenCalledOnce();
        expect(second.getStatusCode()).toBeUndefined();
        expect(second.getHeaders()['Retry-After']).toBeUndefined();
    });

    it('enforce mode: breach returns 429 with Retry-After and does not call next', async () => {
        const limiter = makeLimiter(1);
        const middleware = createWebhookIngressRateLimit({
            limit: 1,
            enforce: true,
            getLimiter: () => Promise.resolve(limiter)
        });

        // consume the only point
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), makeRes().res, vi.fn());

        // breach
        const { res, getStatusCode, getHeaders, getBody } = makeRes();
        const localNext = vi.fn();
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, localNext);

        expect(localNext).not.toHaveBeenCalled();
        expect(getStatusCode()).toBe(429);
        expect(getHeaders()['Retry-After']).toBeGreaterThanOrEqual(1);
        expect(getBody()).toEqual({ error: { code: 'too_many_request' } });
    });

    it('fails open when the limiter throws an unexpected error', async () => {
        const brokenLimiter = {
            consume: vi.fn(() => Promise.reject(new Error('redis unreachable')))
        } as unknown as RateLimiterAbstract;
        const middleware = createWebhookIngressRateLimit({
            limit: 5,
            enforce: true,
            getLimiter: () => Promise.resolve(brokenLimiter)
        });
        const { res, getStatusCode } = makeRes();
        const localNext = vi.fn();

        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, localNext);

        expect(localNext).toHaveBeenCalledOnce();
        expect(getStatusCode()).toBeUndefined();
    });

    it('lowercases the environment uuid before keying', async () => {
        const limiter = makeLimiter(1);
        const middleware = createWebhookIngressRateLimit({
            limit: 1,
            enforce: true,
            getLimiter: () => Promise.resolve(limiter)
        });

        // consume with lowercase
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), makeRes().res, vi.fn());

        // same uuid in uppercase should hit the same bucket
        const { res, getStatusCode } = makeRes();
        await middleware(makeReq({ environmentUuid: VALID_UUID.toUpperCase(), providerConfigKey: 'github' }), res, vi.fn());

        expect(getStatusCode()).toBe(429);
    });
});
