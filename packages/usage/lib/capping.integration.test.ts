import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getRedis } from '@nangohq/kvstore';

import { Capping } from './capping.js';
import { UsageTracker } from './usage.js';

describe('Usage', () => {
    let redis: Awaited<ReturnType<typeof getRedis>>;
    let usageTracker: UsageTracker;
    let capping: Capping;

    beforeAll(async () => {
        const redisUrl = process.env['NANGO_REDIS_URL'];
        if (!redisUrl) {
            throw new Error('NANGO_REDIS_URL environment variable is not set.');
        }
        redis = await getRedis(redisUrl);
        usageTracker = new UsageTracker(redis);
        capping = new Capping(usageTracker, { enabled: true });
    });

    afterAll(async () => {
        await redis.disconnect();
    });

    beforeEach(async () => {
        await redis.flushAll(); // Clear all usage data before each test
    });

    describe('Capping', () => {
        it('should not cap if disabled', async () => {
            const cappingDisabled = new Capping(usageTracker, { enabled: false });
            const plan = { account_id: 1, connections_max: 5 } as any;
            await usageTracker.incr({ accountId: 1, metric: 'connections', delta: 999 }); // Exceed the limit
            const status = await cappingDisabled.getStatus(plan, 'connections');
            expect(status.isCapped).toBe(false);
        });
        it('should not cap if limit is not exceeded', async () => {
            const plan = { account_id: 1, connections_max: 5 } as any;
            await usageTracker.incr({ accountId: 1, metric: 'connections', delta: 3 }); // Below the limit
            const status = await capping.getStatus(plan, 'connections');
            expect(status.isCapped).toBe(false);
            expect(status.message).toBeUndefined();
        });
        it('should not cap if limit is not defined', async () => {
            const plan = { account_id: 1 } as any; // No limit defined
            await usageTracker.incr({ accountId: 1, metric: 'connections', delta: 3 });
            const status = await capping.getStatus(plan, 'connections');
            expect(status.isCapped).toBe(false);
            expect(status.message).toBeUndefined();
        });
        it('should cap if limit exceeded', async () => {
            const plan = { account_id: 1, connections_max: 5 } as any;
            await usageTracker.incr({ accountId: 1, metric: 'connections', delta: 99 }); // Exceed the limit
            const status = await capping.getStatus(plan, 'connections');
            expect(status.isCapped).toBe(true);
            expect(status.metrics['connections']?.isCapped).toBe(true);
            expect(status.metrics['connections']?.current).toBe(99);
            expect(status.metrics['connections']?.limit).toBe(5);
            expect(status.message).toContain('You have reached the maximum number of connections');
        });
        it('should cap if one of the limits is exceeded', async () => {
            const plan = { account_id: 1, connections_max: 5, function_executions_max: 5 } as any;
            await usageTracker.incr({ accountId: 1, metric: 'connections', delta: 99 }); // Exceed the limit
            await usageTracker.incr({ accountId: 1, metric: 'function_executions', delta: 2 }); // Below the limit
            const status = await capping.getStatus(plan, 'connections', 'function_executions');
            expect(status.isCapped).toBe(true);
            expect(status.metrics['connections']?.isCapped).toBe(true);
            expect(status.metrics['connections']?.current).toBe(99);
            expect(status.metrics['connections']?.limit).toBe(5);
            expect(status.message).toContain('You have reached the maximum number of connections');
        });
        it('should not cap if none of the limits is exceeded', async () => {
            const plan = { account_id: 1, connections_max: 5, function_executions_max: 5 } as any;
            await usageTracker.incr({ accountId: 1, metric: 'connections', delta: 3 });
            await usageTracker.incr({ accountId: 1, metric: 'function_executions', delta: 2 });
            const status = await capping.getStatus(plan, 'connections', 'function_executions');
            expect(status.isCapped).toBe(false);
            expect(status.message).toBeUndefined();
        });
    });
});
