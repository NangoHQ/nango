import { describe, expect, it } from 'vitest';

import { createImmediateRateLimiter } from './rateLimiter.js';

describe('createImmediateRateLimiter', () => {
    it('admits everything when the limit is 0', async () => {
        const limiter = await createImmediateRateLimiter(0);

        const first = await limiter.consume('env-1', 5000);
        const second = await limiter.consume('env-1', 5000);

        expect(first).toStrictEqual({ admitted: 5000, rejected: 0, remaining: null, estimatedUsage: null, retryAfterMs: 0, limit: null });
        expect(second.rejected).toBe(0);

        await limiter.destroy();
    });

    it('still enforces an override when the limit is 0', async () => {
        const limiter = await createImmediateRateLimiter(0);

        await expect(limiter.consume('env-1', 5, { limit: 2 })).resolves.toMatchObject({ admitted: 2, rejected: 3, limit: 2 });

        await limiter.destroy();
    });

    it('enforces the limit when one is configured', async () => {
        const limiter = await createImmediateRateLimiter(2);

        const admitted = await limiter.consume('env-2', 2);
        const rejected = await limiter.consume('env-2', 1);

        expect(admitted.admitted).toBe(2);
        expect(admitted.rejected).toBe(0);
        expect(rejected.admitted).toBe(0);
        expect(rejected.rejected).toBe(1);
        expect(rejected.retryAfterMs).toBeGreaterThan(0);

        await limiter.destroy();
    });
});
