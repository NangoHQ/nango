import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRedis } from '@nangohq/kvstore';

import { UsageTracker } from './usage.js';

describe('Usage', () => {
    let redis: Awaited<ReturnType<typeof getRedis>>;
    let usageTracker: UsageTracker;

    beforeAll(async () => {
        const redisUrl = process.env['NANGO_REDIS_URL'];
        if (!redisUrl) {
            throw new Error('NANGO_REDIS_URL environment variable is not set.');
        }
        redis = await getRedis(redisUrl);
        usageTracker = new UsageTracker(redis);
    });

    afterAll(async () => {
        await redis.disconnect();
    });

    beforeEach(async () => {
        await redis.flushAll(); // Clear all usage data before each test
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    describe('get', () => {
        it('should return 0 for a non-existent-yet metric', async () => {
            const res = (await usageTracker.get({ accountId: 1, metric: 'connections' })).unwrap();
            expect(res).toEqual({ accountId: 1, metric: 'connections', current: 0 });
        });
        it('should return an error if entry is invalid', async () => {
            const accountId = 1;
            const metric = 'connections';
            // Manually set an invalid entry in Redis
            await redis.set(`usage:${accountId}:${metric}`, 'invalid-json');

            const res = await usageTracker.get({ accountId, metric });
            expect(res.isErr()).toBe(true);
            if (res.isErr()) {
                expect(res.error.message).toBe('cache_get_error');
            }
        });
        it('should return the current value for an existing metric', async () => {
            const accountId = 1;
            const metric = 'connections';
            await usageTracker.incr({ accountId, metric, delta: 5 });
            const res = (await usageTracker.get({ accountId, metric })).unwrap();
            expect(res).toEqual({ accountId, metric, current: 5 });
        });
    });

    it('should incr metric', async () => {
        const accountId = 1;
        const metric = 'connections';

        const revalidateSpy = vi.spyOn(UsageTracker as any, 'revalidate');

        let res = (await usageTracker.incr({ accountId, metric, delta: 5 })).unwrap();
        expect(res).toEqual({ accountId, metric, current: 5 });

        res = (await usageTracker.incr({ accountId, metric, delta: -4 })).unwrap();
        expect(res).toEqual({ accountId, metric, current: 1 });
        // revalidateAfter hasn't passed yet
        expect(revalidateSpy).not.toHaveBeenCalled();

        // Move time forward by 1 day to pass revalidateAfter
        vi.advanceTimersByTime(24 * 60 * 60 * 1000);

        res = (await usageTracker.incr({ accountId, metric, delta: 10 })).unwrap();
        expect(res).toEqual({ accountId, metric, current: 11 });
        expect(revalidateSpy).toHaveBeenCalledTimes(1);
    });
    it('should incr monthly metric', async () => {
        const accountId = 2;
        const metric = 'proxy';
        const res = (await usageTracker.incr({ accountId, metric, delta: 1 })).unwrap();
        expect(res).toEqual({ accountId, metric, current: 1 });
    });
});
