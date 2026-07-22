import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getRedis } from '@nangohq/kvstore';

import { RedisDispatchCapacityCoordinator } from './capacity-coordinator.js';

import type { NangoRedisClient } from '@nangohq/kvstore';

describe('RedisDispatchCapacityCoordinator', () => {
    let redis: NangoRedisClient;

    beforeAll(async () => {
        const url = process.env['NANGO_REDIS_URL'];
        if (!url) {
            throw new Error('NANGO_REDIS_URL environment variable is not set.');
        }
        redis = await getRedis(url);
    });

    beforeEach(async () => {
        await redis.flushAll();
    });

    function createCoordinator() {
        return new RedisDispatchCapacityCoordinator({
            redis,
            keyPrefix: 'test:webhook-dispatch:{capacity}',
            initialLimit: 1,
            hardMaximum: 2,
            leaseTtlMs: 1000,
            acquireRetryMs: 10,
            healthyLatencyMs: 100,
            controlIntervalMs: 10
        });
    }

    it('shares permits and grows the global limit after healthy saturated work', async () => {
        const firstCoordinator = createCoordinator();
        const secondCoordinator = createCoordinator();
        const firstPermit = await firstCoordinator.acquire(new AbortController().signal);

        const blocked = new AbortController();
        const blockedAcquire = secondCoordinator.acquire(blocked.signal);
        setTimeout(() => blocked.abort(), 30);
        await expect(blockedAcquire).rejects.toMatchObject({ name: 'AbortError' });

        await firstCoordinator.recordSuccess(10);
        const secondPermit = await secondCoordinator.acquire(new AbortController().signal);

        expect(firstPermit.isValid()).toBe(true);
        expect(secondPermit.isValid()).toBe(true);
        await firstPermit.release();
        await secondPermit.release();
    });
});
