import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRedis } from '@nangohq/kvstore';
import { Ok } from '@nangohq/utils';

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
            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = (await usageTracker.get({ accountId: 1, metric: 'connections' })).unwrap();
            expect(res).toEqual({ accountId: 1, metric: 'connections', current: 0 });
        });
        it('should return an error if entry is invalid', async () => {
            const accountId = 1;
            const metric = 'connections';
            // Manually set an invalid entry in Redis
            await redis.set(`usageV2:${accountId}:${metric}`, 'invalid-json');

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = await usageTracker.get({ accountId, metric });
            expect(res.isErr()).toBe(true);
            if (res.isErr()) {
                expect(res.error.message).toBe('cache_get_error');
            }
        });
        it('should return the current value for an existing metric', async () => {
            const accountId = 1;
            const metric = 'connections';

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            await usageTracker.incr({ accountId, metric, delta: 5 });
            const res = (await usageTracker.get({ accountId, metric })).unwrap();
            expect(res).toEqual({ accountId, metric, current: 5 });
        });
        it('should trigger revalidation when entry is null', async () => {
            const accountId = 1;
            const metric = 'connections';

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = (await usageTracker.get({ accountId, metric })).unwrap();
            expect(res).toEqual({ accountId, metric, current: 0 });
            expect(revalidateSpy).toHaveBeenCalledTimes(1);
            expect(revalidateSpy).toHaveBeenCalledWith({ accountId, metric });
        });
        it('should trigger revalidation when revalidateAfter has passed', async () => {
            const accountId = 1;
            const metric = 'connections';

            // Set up an entry with a past revalidateAfter
            await usageTracker.incr({ accountId, metric, delta: 5 });
            // Move time forward by 1 day to pass revalidateAfter
            vi.advanceTimersByTime(24 * 60 * 60 * 1000);

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = (await usageTracker.get({ accountId, metric })).unwrap();
            expect(res).toEqual({ accountId, metric, current: 5 });
            expect(revalidateSpy).toHaveBeenCalledTimes(1);
            expect(revalidateSpy).toHaveBeenCalledWith({ accountId, metric });
        });
        it('should not trigger revalidation when entry exists and is not stale', async () => {
            const accountId = 1;
            const metric = 'connections';

            await usageTracker.incr({ accountId, metric, delta: 5 });

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = (await usageTracker.get({ accountId, metric })).unwrap();
            expect(res).toEqual({ accountId, metric, current: 5 });
            // revalidateAfter hasn't passed yet
            expect(revalidateSpy).not.toHaveBeenCalled();
        });
    });

    describe('incr', () => {
        it('should increment metric', async () => {
            const accountId = 1;
            const metric = 'connections';

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

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
        it('should increment monthly metric', async () => {
            const accountId = 2;
            const metric = 'proxy';

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = (await usageTracker.incr({ accountId, metric, delta: 1 })).unwrap();
            expect(res).toEqual({ accountId, metric, current: 1 });
        });
    });

    describe('getAll', () => {
        it('should trigger revalidation for null entries', async () => {
            const accountId = 1;

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = (await usageTracker.getAll(accountId)).unwrap();
            expect(res).toBeDefined();
            // Should trigger revalidation for all metrics that are null
            expect(revalidateSpy).toHaveBeenCalled();
        });
        it('should trigger revalidation for stale entries', async () => {
            const accountId = 1;
            const metric = 'connections';

            // Set up an entry with a past revalidateAfter
            await usageTracker.incr({ accountId, metric, delta: 5 });
            // Move time forward by 1 day to pass revalidateAfter
            vi.advanceTimersByTime(24 * 60 * 60 * 1000);

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = (await usageTracker.getAll(accountId)).unwrap();
            expect(res).toBeDefined();
            expect(res[metric]).toEqual({ accountId, metric, current: 5 });
            // Should trigger revalidation for the stale metric
            expect(revalidateSpy).toHaveBeenCalledWith({ accountId, metric });
        });
        it('should not trigger revalidation for non-stale entries', async () => {
            const accountId = 1;
            const metric = 'connections';

            await usageTracker.incr({ accountId, metric, delta: 5 });

            const revalidateSpy = vi.spyOn(usageTracker, 'revalidate');
            revalidateSpy.mockReturnValue(Promise.resolve(Ok(undefined)));

            const res = (await usageTracker.getAll(accountId)).unwrap();
            expect(res).toBeDefined();
            expect(res[metric]).toEqual({ accountId, metric, current: 5 });
            // revalidateAfter hasn't passed yet, so revalidation should not be called for this metric
            // (but may be called for other null metrics)
            const callsForMetric = revalidateSpy.mock.calls.filter((call) => call[0].metric === metric);
            expect(callsForMetric).toHaveLength(0);
        });
    });
});
