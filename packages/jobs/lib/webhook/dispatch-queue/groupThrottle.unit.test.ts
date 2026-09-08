import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { GroupThrottles } from './groupThrottle.js';

const GROUP = 'webhook:environment:2';
const OTHER_GROUP = 'webhook:environment:3';

describe('GroupThrottles', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'hrtime'] });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('throttles only the group it was given', () => {
        const throttles = new GroupThrottles({ maxThrottleMs: 60_000 });
        throttles.throttleFor(GROUP, 5_000);

        expect(throttles.isThrottled(GROUP)).toBe(true);
        expect(throttles.isThrottled(OTHER_GROUP)).toBe(false);
    });

    it('expires after the suggested delay', () => {
        const throttles = new GroupThrottles({ maxThrottleMs: 60_000 });
        throttles.throttleFor(GROUP, 5_000);

        vi.advanceTimersByTime(4_999);
        expect(throttles.isThrottled(GROUP)).toBe(true);

        vi.advanceTimersByTime(1);
        expect(throttles.isThrottled(GROUP)).toBe(false);
    });

    it('does not expire early when the wall clock jumps forward', () => {
        const throttles = new GroupThrottles({ maxThrottleMs: 60_000 });
        throttles.throttleFor(GROUP, 5_000);

        vi.setSystemTime(Date.now() + 60_000);
        expect(throttles.isThrottled(GROUP)).toBe(true);

        vi.advanceTimersByTime(5_000);
        expect(throttles.isThrottled(GROUP)).toBe(false);
    });

    it('clamps the suggested delay to the maximum', () => {
        const throttles = new GroupThrottles({ maxThrottleMs: 10_000 });
        throttles.throttleFor(GROUP, 90_000);

        vi.advanceTimersByTime(10_000);
        expect(throttles.isThrottled(GROUP)).toBe(false);
    });

    it('falls back to a throttle when the orchestrator sends no delay', () => {
        const throttles = new GroupThrottles({ maxThrottleMs: 60_000 });
        throttles.throttleFor(GROUP, null);

        vi.advanceTimersByTime(999);
        expect(throttles.isThrottled(GROUP)).toBe(true);

        vi.advanceTimersByTime(1);
        expect(throttles.isThrottled(GROUP)).toBe(false);
    });

    it('keeps the furthest deadline', () => {
        const durationSpy = vi.spyOn(metrics, 'duration');
        const throttles = new GroupThrottles({ maxThrottleMs: 60_000 });
        throttles.throttleFor(GROUP, 5_000);
        vi.advanceTimersByTime(1_000);
        throttles.throttleFor(GROUP, 1_000);

        expect(durationSpy).toHaveBeenLastCalledWith(metrics.Types.WEBHOOK_DISPATCH_THROTTLE_MS, 4_000);

        vi.advanceTimersByTime(3_999);
        expect(throttles.isThrottled(GROUP)).toBe(true);
    });

    it('rounds a fractional maximum up so the deadline is not evicted early', () => {
        const throttles = new GroupThrottles({ maxThrottleMs: 0.5 });
        throttles.throttleFor(GROUP, 5_000);

        expect(throttles.isThrottled(GROUP)).toBe(true);
        vi.advanceTimersByTime(1);
        expect(throttles.isThrottled(GROUP)).toBe(false);
    });

    it('does nothing when the maximum is zero', () => {
        const throttles = new GroupThrottles({ maxThrottleMs: 0 });
        throttles.throttleFor(GROUP, 5_000);

        expect(throttles.isThrottled(GROUP)).toBe(false);
    });

    it('evicts groups whose throttle has passed', () => {
        const throttles = new GroupThrottles({ maxThrottleMs: 60_000 });
        throttles.throttleFor(GROUP, 1_000);
        expect(throttles).toHaveProperty('throttledGroups.size', 1);

        vi.advanceTimersByTime(60_000);
        expect(throttles.isThrottled(GROUP)).toBe(false);
        expect(throttles).toHaveProperty('throttledGroups.size', 0);
    });
});
