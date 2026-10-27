import { RateLimiterMemory } from 'rate-limiter-flexible';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { createCatalogCodeRateLimit } from './catalogCodeRateLimit.middleware.js';

import type { NextFunction, Request, Response } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';

function makeRes(accountId: number) {
    const headers: Record<string, unknown> = {};
    let statusCode: number | undefined;
    let body: unknown;
    const res = {
        locals: { account: { id: accountId } },
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

function withLimit(limit: number) {
    const limiter = new RateLimiterMemory({ keyPrefix: `test-catalog-code-${Math.random()}`, points: limit, duration: 86400, blockDuration: 0 });
    return createCatalogCodeRateLimit({ limit, getLimiter: () => Promise.resolve(limiter) });
}

const req = {} as Request;

describe('catalogCodeRateLimit middleware', () => {
    let next: NextFunction;

    beforeEach(() => {
        next = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('lets requests under the daily limit through', async () => {
        const middleware = withLimit(2);

        await middleware(req, makeRes(1).res, next);
        await middleware(req, makeRes(1).res, next);

        expect(next).toHaveBeenCalledTimes(2);
    });

    it('rejects an account over the daily limit with a 429 and reports the account', async () => {
        const incrementSpy = vi.spyOn(metrics, 'increment').mockImplementation(() => {});
        const middleware = withLimit(1);

        await middleware(req, makeRes(1).res, next);
        const rejected = makeRes(1);
        await middleware(req, rejected.res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(rejected.getStatusCode()).toBe(429);
        expect(rejected.getBody()).toMatchObject({ error: { code: 'too_many_request' } });
        expect(rejected.getHeaders()['Retry-After']).toBeGreaterThanOrEqual(1);
        expect(incrementSpy).toHaveBeenCalledWith(metrics.Types.CATALOG_CODE_RATE_LIMITED, 1, { accountId: 1 });
    });

    it('counts each account separately', async () => {
        const middleware = withLimit(1);

        await middleware(req, makeRes(1).res, next);
        const otherAccount = makeRes(2);
        await middleware(req, otherAccount.res, next);

        expect(otherAccount.getStatusCode()).toBeUndefined();
        expect(next).toHaveBeenCalledTimes(2);
    });

    it('is disabled when the limit is 0', async () => {
        const getLimiter = vi.fn();
        const middleware = createCatalogCodeRateLimit({ limit: 0, getLimiter });

        await middleware(req, makeRes(1).res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(getLimiter).not.toHaveBeenCalled();
    });

    it('lets the request through when the limiter store fails', async () => {
        const failing = { consume: () => Promise.reject(new Error('redis down')) } as unknown as RateLimiterAbstract;
        const middleware = createCatalogCodeRateLimit({ limit: 1, getLimiter: () => Promise.resolve(failing) });

        await middleware(req, makeRes(1).res, next);

        expect(next).toHaveBeenCalledOnce();
    });
});
