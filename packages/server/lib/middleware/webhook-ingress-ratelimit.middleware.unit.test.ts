import { RateLimiterMemory } from 'rate-limiter-flexible';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { createEnvironmentIngressRateLimit, KnownIngressTargets } from './webhook-ingress-ratelimit.middleware.js';

import type { IngressLimiters } from './webhook-ingress-ratelimit.middleware.js';
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

function makeLimiters({ limit, unknownEnvironmentLimit }: { limit: number; unknownEnvironmentLimit: number }): IngressLimiters {
    return {
        integration: new RateLimiterMemory({ keyPrefix: 'test-integration', points: limit, duration: 60 }),
        unknownEnvironment: new RateLimiterMemory({ keyPrefix: 'test-unknown-env', points: unknownEnvironmentLimit, duration: 60 }),
        unknownIntegration: new RateLimiterMemory({ keyPrefix: 'test-unknown-integration', points: limit, duration: 60 })
    };
}

function makeKnownTargets(environments: string[] = [], integrations: string[] = []) {
    return {
        isKnownEnvironment: vi.fn((uuid: string) => Promise.resolve(environments.includes(uuid))),
        isKnownIntegration: vi.fn((uuid: string, key: string) => integrations.includes(`${uuid}:${key}`))
    };
}

function makeMiddleware(opts: {
    limit: number;
    unknownEnvironmentLimit?: number;
    enforce?: boolean;
    knownTargets?: ReturnType<typeof makeKnownTargets>;
    getLimiters?: () => Promise<IngressLimiters>;
    fallbackLimiters?: IngressLimiters;
}) {
    const unknownEnvironmentLimit = opts.unknownEnvironmentLimit ?? 2;
    const fallbackLimiters = opts.fallbackLimiters ?? makeLimiters({ limit: opts.limit, unknownEnvironmentLimit });
    return createEnvironmentIngressRateLimit({
        limit: opts.limit,
        unknownEnvironmentLimit,
        enforce: opts.enforce ?? true,
        metric: metrics.Types.WEBHOOK_INCOMING_RATE_LIMITED,
        knownTargets:
            opts.knownTargets ?? makeKnownTargets([VALID_UUID, ANOTHER_UUID], [`${VALID_UUID}:github`, `${VALID_UUID}:slack`, `${ANOTHER_UUID}:github`]),
        getLimiters: opts.getLimiters ?? (() => Promise.resolve(fallbackLimiters)),
        fallbackLimiters
    });
}

async function call(middleware: ReturnType<typeof makeMiddleware>, environmentUuid: string, providerConfigKey: string) {
    const res = makeRes();
    const next = vi.fn();
    await middleware(makeReq({ environmentUuid, providerConfigKey }), res.res, next);
    return { ...res, next };
}

describe('webhookIngressRateLimit middleware', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = vi.fn();
    });

    it('passes through when limit is 0 (disabled)', async () => {
        const getLimiters = vi.fn();
        const middleware = makeMiddleware({ limit: 0, getLimiters });
        const { res } = makeRes();

        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(getLimiters).not.toHaveBeenCalled();
    });

    it('allows requests within the limit and returns 429 on N+1', async () => {
        const middleware = makeMiddleware({ limit: 2 });

        for (let i = 0; i < 2; i++) {
            const { next: localNext, getHeaders } = await call(middleware, VALID_UUID, 'github');
            expect(localNext).toHaveBeenCalledOnce();
            expect(getHeaders()['X-RateLimit-Limit']).toBe(2);
        }

        const { next: localNext, getStatusCode, getHeaders, getBody } = await call(middleware, VALID_UUID, 'github');
        expect(localNext).not.toHaveBeenCalled();
        expect(getStatusCode()).toBe(429);
        expect(getHeaders()['Retry-After']).toBeGreaterThanOrEqual(1);
        expect(getHeaders()['X-RateLimit-Remaining']).toBe(0);
        expect(getBody()).toEqual({ error: { code: 'too_many_request' } });
    });

    it('known integrations do not share a budget', async () => {
        const middleware = makeMiddleware({ limit: 1 });

        expect((await call(middleware, VALID_UUID, 'github')).next).toHaveBeenCalledOnce();
        expect((await call(middleware, ANOTHER_UUID, 'github')).next).toHaveBeenCalledOnce();
        expect((await call(middleware, VALID_UUID, 'slack')).next).toHaveBeenCalledOnce();
    });

    it('shadow mode: breach is observed but request continues', async () => {
        const middleware = makeMiddleware({ limit: 1, enforce: false });

        await call(middleware, VALID_UUID, 'github');
        const second = await call(middleware, VALID_UUID, 'github');

        expect(second.next).toHaveBeenCalledOnce();
        expect(second.getStatusCode()).toBeUndefined();
        expect(second.getHeaders()['Retry-After']).toBeUndefined();
    });

    it('charges every unknown environment id to one shared budget, whatever its format', async () => {
        const middleware = makeMiddleware({ limit: 100, unknownEnvironmentLimit: 3 });
        const ids = [
            '33333333-3333-4333-8333-333333333333',
            '11111111-1111-1111-8111-000000000001',
            'not-a-uuid',
            '44444444-4444-4444-8444-444444444444',
            '55555555-5555-1555-8555-555555555555'
        ];

        const results = [];
        for (const id of ids) {
            results.push(await call(middleware, id, 'github'));
        }

        expect(results.slice(0, 3).every((r) => r.next.mock.calls.length === 1)).toBe(true);
        for (const r of results.slice(3)) {
            expect(r.next).not.toHaveBeenCalled();
            expect(r.getStatusCode()).toBe(429);
            expect(r.getHeaders()['X-RateLimit-Limit']).toBe(3);
        }
    });

    it('known environments do not use the unknown environment budget', async () => {
        const middleware = makeMiddleware({ limit: 100, unknownEnvironmentLimit: 1 });

        expect((await call(middleware, '33333333-3333-4333-8333-333333333333', 'github')).next).toHaveBeenCalledOnce();
        expect((await call(middleware, '44444444-4444-4444-8444-444444444444', 'github')).getStatusCode()).toBe(429);

        for (let i = 0; i < 5; i++) {
            expect((await call(middleware, VALID_UUID, 'github')).next).toHaveBeenCalledOnce();
        }
    });

    it('charges unknown integration keys of a known environment to one budget for that environment', async () => {
        const middleware = makeMiddleware({ limit: 3 });

        for (let i = 0; i < 3; i++) {
            expect((await call(middleware, VALID_UUID, `spray-${i}`)).next).toHaveBeenCalledOnce();
        }
        const sprayed = await call(middleware, VALID_UUID, 'spray-3');
        expect(sprayed.next).not.toHaveBeenCalled();
        expect(sprayed.getStatusCode()).toBe(429);

        // Confirmed integrations of that environment, and other environments, are unaffected
        expect((await call(middleware, VALID_UUID, 'github')).next).toHaveBeenCalledOnce();
        expect((await call(middleware, ANOTHER_UUID, 'spray-0')).next).toHaveBeenCalledOnce();
    });

    it('does not create a per-integration bucket for a rejected unknown environment', async () => {
        const limiters = makeLimiters({ limit: 100, unknownEnvironmentLimit: 1 });
        const consumeIntegration = vi.spyOn(limiters.integration, 'consume');
        const middleware = makeMiddleware({ limit: 100, unknownEnvironmentLimit: 1, fallbackLimiters: limiters });

        await call(middleware, '33333333-3333-4333-8333-333333333333', 'github');
        await call(middleware, '44444444-4444-4444-8444-444444444444', 'github');

        expect(consumeIntegration).toHaveBeenCalledOnce();
    });

    it('falls back to the in-process limiter when the shared limiter throws, and still enforces', async () => {
        const brokenConsume = vi.fn(() => Promise.reject(new Error('redis unreachable')));
        const broken = { consume: brokenConsume } as unknown as RateLimiterAbstract;
        const fallbackLimiters = makeLimiters({ limit: 1, unknownEnvironmentLimit: 1 });
        const middleware = makeMiddleware({
            limit: 1,
            fallbackLimiters,
            getLimiters: () => Promise.resolve({ integration: broken, unknownEnvironment: broken, unknownIntegration: broken })
        });

        expect((await call(middleware, VALID_UUID, 'github')).next).toHaveBeenCalledOnce();
        const breached = await call(middleware, VALID_UUID, 'github');
        expect(breached.next).not.toHaveBeenCalled();
        expect(breached.getStatusCode()).toBe(429);
        expect(brokenConsume).toHaveBeenCalled();
    });

    it('falls back to the in-process limiter when the shared limiter cannot be built', async () => {
        const middleware = makeMiddleware({ limit: 1, getLimiters: () => Promise.reject(new Error('redis unreachable')) });

        expect((await call(middleware, VALID_UUID, 'github')).next).toHaveBeenCalledOnce();
        expect((await call(middleware, VALID_UUID, 'github')).getStatusCode()).toBe(429);
    });

    it('does not run the handler when the known-target check fails', async () => {
        const knownTargets = makeKnownTargets();
        knownTargets.isKnownEnvironment.mockRejectedValue(new Error('boom'));
        const middleware = makeMiddleware({ limit: 5, knownTargets });

        const { res } = makeRes();
        await middleware(makeReq({ environmentUuid: VALID_UUID, providerConfigKey: 'github' }), res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('lowercases the environment uuid before keying', async () => {
        const knownTargets = makeKnownTargets([VALID_UUID], [`${VALID_UUID}:github`]);
        const middleware = makeMiddleware({ limit: 1, knownTargets });

        await call(middleware, VALID_UUID, 'github');
        const upper = await call(middleware, VALID_UUID.toUpperCase(), 'github');

        expect(knownTargets.isKnownEnvironment).toHaveBeenLastCalledWith(VALID_UUID);
        expect(upper.getStatusCode()).toBe(429);
    });
});

describe('KnownIngressTargets', () => {
    function makeTargets(loadEnvironmentUuids: () => Promise<string[]>, overrides: Partial<ConstructorParameters<typeof KnownIngressTargets>[0]> = {}) {
        return new KnownIngressTargets({ loadEnvironmentUuids, refreshMs: 60_000, retryMs: 1000, firstLoadWaitMs: 50, maxConfirmed: 10, ...overrides });
    }

    it('knows environments from the snapshot, case-insensitively', async () => {
        const targets = makeTargets(() => Promise.resolve([VALID_UUID.toUpperCase()]));

        expect(await targets.isKnownEnvironment(VALID_UUID)).toBe(true);
        expect(await targets.isKnownEnvironment(ANOTHER_UUID)).toBe(false);
    });

    it('loads the snapshot once per refresh interval', async () => {
        const load = vi.fn(() => Promise.resolve([VALID_UUID]));
        const targets = makeTargets(load);

        for (let i = 0; i < 5; i++) {
            await targets.isKnownEnvironment(ANOTHER_UUID);
        }

        expect(load).toHaveBeenCalledOnce();
    });

    it('treats every id as unknown when the snapshot fails to load, until confirmed', async () => {
        const targets = makeTargets(() => Promise.reject(new Error('db down')));

        expect(await targets.isKnownEnvironment(VALID_UUID)).toBe(false);

        targets.confirmEnvironment(VALID_UUID.toUpperCase());
        expect(await targets.isKnownEnvironment(VALID_UUID)).toBe(true);
    });

    it('does not hold requests on a slow first load', async () => {
        const targets = makeTargets(() => new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 5000).unref()), { firstLoadWaitMs: 20 });

        const start = Date.now();
        expect(await targets.isKnownEnvironment(VALID_UUID)).toBe(false);
        expect(await targets.isKnownEnvironment(VALID_UUID)).toBe(false);
        expect(Date.now() - start).toBeLessThan(1000);
    });

    it('confirms integrations per environment', () => {
        const targets = makeTargets(() => Promise.resolve([]));

        targets.confirmIntegration(VALID_UUID.toUpperCase(), 'github');

        expect(targets.isKnownIntegration(VALID_UUID, 'github')).toBe(true);
        expect(targets.isKnownIntegration(VALID_UUID, 'GITHUB')).toBe(false);
        expect(targets.isKnownIntegration(ANOTHER_UUID, 'github')).toBe(false);
    });

    it('bounds the number of confirmed targets', () => {
        const targets = makeTargets(() => Promise.resolve([]), { maxConfirmed: 2 });

        targets.confirmIntegration(VALID_UUID, 'a');
        targets.confirmIntegration(VALID_UUID, 'b');
        targets.confirmIntegration(VALID_UUID, 'c');

        expect(targets.isKnownIntegration(VALID_UUID, 'a')).toBe(false);
        expect(targets.isKnownIntegration(VALID_UUID, 'b')).toBe(true);
        expect(targets.isKnownIntegration(VALID_UUID, 'c')).toBe(true);
    });
});
