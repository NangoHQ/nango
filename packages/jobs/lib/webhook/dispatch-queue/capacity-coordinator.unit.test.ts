import { describe, expect, it, vi } from 'vitest';

import { RedisDispatchCapacityCoordinator } from './capacity-coordinator.js';

import type { NangoRedisClient } from '@nangohq/kvstore';

describe('RedisDispatchCapacityCoordinator', () => {
    it('retries a transient permit renewal failure while the lease is valid', async () => {
        const evalMock = vi
            .fn()
            .mockResolvedValueOnce([1, 1, 0, 1, 1300, 1000])
            .mockRejectedValueOnce(new Error('Redis unavailable'))
            .mockResolvedValueOnce([1300, 1000])
            .mockResolvedValueOnce(0);
        const coordinator = new RedisDispatchCapacityCoordinator({
            redis: { eval: evalMock } as unknown as NangoRedisClient,
            keyPrefix: 'test:webhook-dispatch:{capacity}',
            initialLimit: 1,
            hardMaximum: 2,
            leaseTtlMs: 300,
            acquireRetryMs: 10,
            healthyLatencyMs: 100,
            controlIntervalMs: 10
        });
        const permit = await coordinator.acquire(new AbortController().signal);

        await vi.waitFor(() => expect(evalMock).toHaveBeenCalledTimes(2));
        expect(permit.isValid()).toBe(true);

        await vi.waitFor(() => expect(evalMock).toHaveBeenCalledTimes(3));
        expect(permit.isValid()).toBe(true);

        await permit.release();
    });

    it('does not extend the Redis lease when acquisition is slow', async () => {
        const evalMock = vi
            .fn()
            .mockImplementationOnce(async () => {
                await new Promise((resolve) => setTimeout(resolve, 350));
                return [1, 1, 0, 1, 1300, 1000];
            })
            .mockResolvedValueOnce(0);
        const coordinator = new RedisDispatchCapacityCoordinator({
            redis: { eval: evalMock } as unknown as NangoRedisClient,
            keyPrefix: 'test:webhook-dispatch:{capacity}',
            initialLimit: 1,
            hardMaximum: 2,
            leaseTtlMs: 300,
            acquireRetryMs: 10,
            healthyLatencyMs: 100,
            controlIntervalMs: 10
        });

        const permit = await coordinator.acquire(new AbortController().signal);

        expect(permit.isValid()).toBe(false);
        await permit.release();
    });

    it('can become valid again after a renewal extends the Redis lease', async () => {
        const evalMock = vi.fn().mockResolvedValueOnce([1, 1, 0, 1, 1050, 1000]).mockResolvedValueOnce([1300, 1000]).mockResolvedValueOnce(0);
        const coordinator = new RedisDispatchCapacityCoordinator({
            redis: { eval: evalMock } as unknown as NangoRedisClient,
            keyPrefix: 'test:webhook-dispatch:{capacity}',
            initialLimit: 1,
            hardMaximum: 2,
            leaseTtlMs: 300,
            acquireRetryMs: 10,
            healthyLatencyMs: 100,
            controlIntervalMs: 10
        });
        const permit = await coordinator.acquire(new AbortController().signal);

        expect(permit.isValid()).toBe(false);
        await vi.waitFor(() => expect(evalMock).toHaveBeenCalledTimes(2));
        expect(permit.isValid()).toBe(true);

        await permit.release();
    });
});
