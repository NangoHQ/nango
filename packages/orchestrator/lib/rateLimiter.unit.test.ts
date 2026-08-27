import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySlidingWindowRateLimiter } from '@nangohq/kvstore';
import { metrics } from '@nangohq/utils';

import { createImmediateRateLimiter, withThrottleTelemetry } from './rateLimiter.js';

import type { SlidingWindowRateLimiter } from '@nangohq/kvstore';
import type { MockInstance } from 'vitest';

const WINDOW_MS = 60_000;

describe('createImmediateRateLimiter', () => {
    it('admits everything when the limit is 0', async () => {
        const limiter = await createImmediateRateLimiter(0);

        const first = await limiter.consume('env-1', 5000);
        const second = await limiter.consume('env-1', 5000);

        expect(first).toStrictEqual({ admitted: 5000, rejected: 0, remaining: null, estimatedUsage: null, retryAfterMs: 0 });
        expect(second.rejected).toBe(0);

        await limiter.destroy();
    });

    it('does not report throttle telemetry when the limit is 0', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        const gauge = vi.spyOn(metrics, 'gauge');
        const limiter = await createImmediateRateLimiter(0);

        await limiter.consume('env-1', 10);

        expect(increment).not.toHaveBeenCalled();
        expect(gauge).not.toHaveBeenCalled();

        await limiter.destroy();
        vi.restoreAllMocks();
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

describe('withThrottleTelemetry', () => {
    let limiter: SlidingWindowRateLimiter;
    let increment: MockInstance<typeof metrics.increment>;
    let gauge: MockInstance<typeof metrics.gauge>;

    function build(limit: number): SlidingWindowRateLimiter {
        limiter = withThrottleTelemetry(new InMemorySlidingWindowRateLimiter({ keyPrefix: 'throttle-telemetry-test', limit, windowMs: WINDOW_MS }), limit);
        return limiter;
    }

    beforeEach(() => {
        increment = vi.spyOn(metrics, 'increment');
        gauge = vi.spyOn(metrics, 'gauge');
    });

    afterEach(async () => {
        await limiter.destroy();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('reports the effective limit alongside the admitted units', async () => {
        await build(10).consume('env-1', 4);

        expect(gauge).toHaveBeenCalledWith(metrics.Types.ORCH_IMMEDIATE_THROTTLE_LIMIT, 10);
        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_IMMEDIATE_THROTTLE, 4, { result: 'admitted' });
        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_IMMEDIATE_THROTTLE, 0, { result: 'throttled' });
    });

    it('splits a partially admitted call across the admitted and throttled counters', async () => {
        const throttled = build(5);
        await throttled.consume('env-1', 4);
        increment.mockClear();

        await throttled.consume('env-1', 3);

        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_IMMEDIATE_THROTTLE, 1, { result: 'admitted' });
        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_IMMEDIATE_THROTTLE, 2, { result: 'throttled' });
    });

    it('totals the counters across keys since the decision is not tagged per key', async () => {
        const throttled = build(1);

        await throttled.consume('env-1', 2);
        await throttled.consume('env-2', 1);

        expect(countedUnits(increment, 'admitted')).toBe(2);
        expect(countedUnits(increment, 'throttled')).toBe(1);
    });

    it('counts everything as admitted when the limiter failed open', async () => {
        const failedOpen: SlidingWindowRateLimiter = {
            consume: (_key, units) => Promise.resolve({ admitted: units, rejected: 0, remaining: null, estimatedUsage: null, retryAfterMs: 0 }),
            destroy: () => Promise.resolve()
        };
        limiter = withThrottleTelemetry(failedOpen, 10);

        await limiter.consume('env-1', 3);

        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_IMMEDIATE_THROTTLE, 3, { result: 'admitted' });
        expect(countedUnits(increment, 'throttled')).toBe(0);
    });

    it('admits exactly the limit under a burst and accounts for every unit', async () => {
        const limit = 50;
        const burst = 400;
        const throttled = build(limit);

        const results = await Promise.all(Array.from({ length: burst }, () => throttled.consume('env-burst', 1)));

        expect(results.filter((r) => r.admitted === 1)).toHaveLength(limit);
        expect(results.filter((r) => r.rejected === 1)).toHaveLength(burst - limit);
        expect(countedUnits(increment, 'admitted')).toBe(limit);
        expect(countedUnits(increment, 'throttled')).toBe(burst - limit);
    });

    it('reports recovery once the window has rolled over', async () => {
        vi.useFakeTimers();
        // Start on a window boundary so the rollover below is exact.
        vi.setSystemTime(WINDOW_MS * 1000);
        const throttled = build(10);

        await throttled.consume('env-recovery', 10);
        const atLimit = await throttled.consume('env-recovery', 1);
        increment.mockClear();

        // Two windows on: the weighted window carries nothing over, so the full limit is free again.
        vi.setSystemTime(WINDOW_MS * 1002);
        const recovered = await throttled.consume('env-recovery', 10);

        expect(atLimit.rejected).toBe(1);
        expect(recovered.admitted).toBe(10);
        expect(recovered.rejected).toBe(0);
        expect(countedUnits(increment, 'throttled')).toBe(0);
        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_IMMEDIATE_THROTTLE, 10, { result: 'admitted' });
    });

    it('reports the partial capacity available half a window into the rollover', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(WINDOW_MS * 1000);
        const throttled = build(10);

        await throttled.consume('env-partial', 10);

        vi.setSystemTime(WINDOW_MS * 1001 + WINDOW_MS / 2);
        const partial = await throttled.consume('env-partial', 10);

        expect(partial.admitted).toBe(5);
        expect(partial.rejected).toBe(5);
        expect(countedUnits(increment, 'admitted')).toBe(15);
    });
});

function countedUnits(increment: MockInstance<typeof metrics.increment>, result: 'admitted' | 'throttled'): number {
    return increment.mock.calls
        .filter(([metric, , tags]) => metric === metrics.Types.ORCH_IMMEDIATE_THROTTLE && tags?.['result'] === result)
        .reduce((total, [, units]) => total + (units ?? 0), 0);
}
