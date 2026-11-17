import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestLocals } from '../utils/express.js';
import type { NextFunction, Request, Response } from 'express';

const consume = vi.spyOn(RateLimiterMemory.prototype, 'consume');
const { rateLimiterMiddleware } = await import('./ratelimit.middleware.js');

describe('rateLimiterMiddleware task token bucket', () => {
    beforeEach(() => {
        consume.mockReset();
        consume.mockResolvedValue(new RateLimiterRes(1, 1000, 1, true));
    });

    it('uses account-task-<id> even when Nango-Is-Script is set', async () => {
        const req = {
            get: (name: string) => (name === 'Nango-Is-Script' ? 'true' : undefined),
            baseUrl: '',
            route: { path: '/proxy/*' },
            path: '/proxy/example',
            ip: '127.0.0.1'
        } as unknown as Request;
        const res = {
            locals: { authType: 'taskToken', account: { id: 42 } },
            setHeader: vi.fn()
        } as unknown as Response<unknown, Partial<RequestLocals>>;
        const next = vi.fn() as unknown as NextFunction;

        await rateLimiterMiddleware(req, res, next);

        expect(consume).toHaveBeenCalledWith('account-task-42', 1);
        expect(next).toHaveBeenCalledOnce();
    });
});
