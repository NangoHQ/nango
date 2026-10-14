import { RateLimiterMemory } from 'rate-limiter-flexible';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAgentPlaygroundRateLimit } from './agentPlaygroundRateLimit.middleware.js';

import type { NextFunction, Request, Response } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';

function makeRes(accountId: number, userId: number) {
    const headers: Record<string, unknown> = {};
    let statusCode: number | undefined;
    let body: unknown;
    const res = {
        locals: { account: { id: accountId }, user: { id: userId } },
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
    return { res: res as unknown as Response, getHeaders: () => headers, getStatusCode: () => statusCode, getBody: () => body };
}

function makeLimiter(scope: string, points: number): RateLimiterAbstract {
    return new RateLimiterMemory({ keyPrefix: `test-agent-playground-${scope}-${Math.random()}`, points, duration: 60, blockDuration: 0 });
}

function withLimits(userPoints: number, accountPoints: number) {
    const limiters = { user: makeLimiter('user', userPoints), account: makeLimiter('account', accountPoints) };
    return createAgentPlaygroundRateLimit(() => Promise.resolve(limiters));
}

const req = {} as Request;

describe('agentPlaygroundRateLimit middleware', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = vi.fn();
    });

    it('lets requests under both limits through', async () => {
        const middleware = withLimits(2, 5);

        await middleware(req, makeRes(1, 1).res, next);
        await middleware(req, makeRes(1, 1).res, next);

        expect(next).toHaveBeenCalledTimes(2);
    });

    it('rejects a user over their limit with a 429 and Retry-After', async () => {
        const middleware = withLimits(1, 5);

        await middleware(req, makeRes(1, 1).res, next);
        const rejected = makeRes(1, 1);
        await middleware(req, rejected.res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(rejected.getStatusCode()).toBe(429);
        expect(rejected.getBody()).toMatchObject({ error: { code: 'too_many_request' } });
        expect(rejected.getHeaders()['Retry-After']).toBeGreaterThanOrEqual(1);
    });

    it('rejects a second user once the account is over its limit', async () => {
        const middleware = withLimits(5, 1);

        await middleware(req, makeRes(1, 1).res, next);
        const rejected = makeRes(1, 2);
        await middleware(req, rejected.res, next);
        const otherAccount = makeRes(2, 3);
        await middleware(req, otherAccount.res, next);

        expect(rejected.getStatusCode()).toBe(429);
        expect(otherAccount.getStatusCode()).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(2);
    });

    it('lets the request through when the limiter store fails', async () => {
        const failing = { consume: () => Promise.reject(new Error('redis down')) } as unknown as RateLimiterAbstract;
        const middleware = createAgentPlaygroundRateLimit(() => Promise.resolve({ user: failing, account: failing }));

        await middleware(req, makeRes(1, 1).res, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it('lets the request through when the limiters cannot be built', async () => {
        const middleware = createAgentPlaygroundRateLimit(() => Promise.reject(new Error('no redis')));

        await middleware(req, makeRes(1, 1).res, next);

        expect(next).toHaveBeenCalledOnce();
    });
});
