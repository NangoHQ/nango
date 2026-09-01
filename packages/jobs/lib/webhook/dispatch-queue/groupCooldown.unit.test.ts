import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { GroupCooldowns } from './groupCooldown.js';

const GROUP = 'webhook:environment:2';
const OTHER_GROUP = 'webhook:environment:3';

describe('GroupCooldowns', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('cools down only the group it was given', () => {
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 60_000 });
        cooldowns.start(GROUP, 5_000);

        expect(cooldowns.isCoolingDown(GROUP)).toBe(true);
        expect(cooldowns.isCoolingDown(OTHER_GROUP)).toBe(false);
    });

    it('expires after the suggested delay', () => {
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 60_000 });
        cooldowns.start(GROUP, 5_000);

        vi.advanceTimersByTime(4_999);
        expect(cooldowns.isCoolingDown(GROUP)).toBe(true);

        vi.advanceTimersByTime(1);
        expect(cooldowns.isCoolingDown(GROUP)).toBe(false);
    });

    it('clamps the suggested delay to the maximum', () => {
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 10_000 });
        cooldowns.start(GROUP, 90_000);

        vi.advanceTimersByTime(10_000);
        expect(cooldowns.isCoolingDown(GROUP)).toBe(false);
    });

    it('falls back to a cooldown when the orchestrator sends no delay', () => {
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 60_000 });
        cooldowns.start(GROUP, null);

        vi.advanceTimersByTime(999);
        expect(cooldowns.isCoolingDown(GROUP)).toBe(true);

        vi.advanceTimersByTime(1);
        expect(cooldowns.isCoolingDown(GROUP)).toBe(false);
    });

    it('keeps the furthest deadline', () => {
        const durationSpy = vi.spyOn(metrics, 'duration');
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 60_000 });
        cooldowns.start(GROUP, 5_000);
        vi.advanceTimersByTime(1_000);
        cooldowns.start(GROUP, 1_000);

        expect(durationSpy).toHaveBeenLastCalledWith(metrics.Types.WEBHOOK_DISPATCH_COOLDOWN_MS, 4_000);

        vi.advanceTimersByTime(3_999);
        expect(cooldowns.isCoolingDown(GROUP)).toBe(true);
    });

    it('rounds a fractional maximum up so the deadline is not evicted early', () => {
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 0.5 });
        cooldowns.start(GROUP, 5_000);

        expect(cooldowns.isCoolingDown(GROUP)).toBe(true);
        vi.advanceTimersByTime(1);
        expect(cooldowns.isCoolingDown(GROUP)).toBe(false);
    });

    it('does not evict a live cooldown when many groups are throttled', () => {
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 60_000 });
        for (let i = 0; i <= 10_000; i++) {
            cooldowns.start(`webhook:environment:${i}`, 60_000);
        }

        expect(cooldowns.isCoolingDown('webhook:environment:0')).toBe(true);
        expect(cooldowns).toHaveProperty('throttledGroups.size', 10_001);
    });

    it('does nothing when the maximum is zero', () => {
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 0 });
        cooldowns.start(GROUP, 5_000);

        expect(cooldowns.isCoolingDown(GROUP)).toBe(false);
    });

    it('evicts groups whose cooldown has passed', () => {
        const cooldowns = new GroupCooldowns({ maxCooldownMs: 60_000 });
        cooldowns.start(GROUP, 1_000);
        expect(cooldowns).toHaveProperty('throttledGroups.size', 1);

        vi.advanceTimersByTime(60_000);
        expect(cooldowns.isCoolingDown(GROUP)).toBe(false);
        expect(cooldowns).toHaveProperty('throttledGroups.size', 0);
    });
});
