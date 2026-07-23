import { describe, expect, it } from 'vitest';

import { formatLimit, formatUsage, getAggregateUsageState, getUsageState, getUsageStateTextColor, NEAR_LIMIT_RATIO } from './usage.js';

describe('getUsageState', () => {
    it('is uncapped when there is no limit', () => {
        expect(getUsageState(1000, null)).toBe('uncapped');
        expect(getUsageState(0, null)).toBe('uncapped');
        // A 0 limit is treated as no cap (falsy), not an instant over.
        expect(getUsageState(50, 0)).toBe('uncapped');
    });

    it('is ok below the near threshold', () => {
        expect(getUsageState(0, 100)).toBe('ok');
        expect(getUsageState(69, 100)).toBe('ok');
    });

    it('is near from exactly the threshold up to the limit', () => {
        // NEAR_LIMIT_RATIO is 0.7, so 70/100 is the first "near" value.
        expect(getUsageState(70, 100)).toBe('near');
        expect(getUsageState(99, 100)).toBe('near');
        // Exact-ratio boundary independent of scale.
        expect(getUsageState(7, 10)).toBe('near');
    });

    it('is over at and above the limit', () => {
        expect(getUsageState(100, 100)).toBe('over');
        expect(getUsageState(150, 100)).toBe('over');
    });

    it('keeps the near threshold at 70%', () => {
        expect(NEAR_LIMIT_RATIO).toBe(0.7);
    });
});

describe('getUsageStateTextColor', () => {
    it('maps each state to its text colour', () => {
        expect(getUsageStateTextColor('uncapped')).toBe('text-text-muted');
        expect(getUsageStateTextColor('ok')).toBe('text-text-default');
        expect(getUsageStateTextColor('near')).toBe('text-text-warning');
        expect(getUsageStateTextColor('over')).toBe('text-text-danger');
    });
});

describe('getAggregateUsageState', () => {
    it('returns ok for no metrics', () => {
        expect(getAggregateUsageState({})).toBe('ok');
    });

    it('returns ok when every capped metric is comfortably under its limit', () => {
        expect(getAggregateUsageState({ a: { usage: 1, limit: 10 }, b: { usage: 2, limit: 100 } })).toBe('ok');
    });

    it('returns near when a metric is close to its limit', () => {
        expect(getAggregateUsageState({ a: { usage: 1, limit: 10 }, b: { usage: 9, limit: 10 } })).toBe('near');
    });

    it('returns over when a metric is at or above its limit', () => {
        expect(getAggregateUsageState({ a: { usage: 9, limit: 10 }, b: { usage: 10, limit: 10 } })).toBe('over');
    });

    it('prefers over to near when both are present', () => {
        expect(getAggregateUsageState({ near: { usage: 9, limit: 10 }, over: { usage: 20, limit: 10 } })).toBe('over');
    });

    it('ignores uncapped metrics (null limit)', () => {
        expect(getAggregateUsageState({ uncapped: { usage: 999_999, limit: null } })).toBe('ok');
        expect(getAggregateUsageState({ uncapped: { usage: 999_999, limit: null }, near: { usage: 9, limit: 10 } })).toBe('near');
    });
});

describe('formatLimit', () => {
    it('abbreviates exact multiples of 1000 as K/M/B/T', () => {
        expect(formatLimit(1000)).toBe('1K');
        expect(formatLimit(2000)).toBe('2K');
        expect(formatLimit(1_000_000)).toBe('1M');
        expect(formatLimit(1_000_000_000)).toBe('1B');
        expect(formatLimit(1_000_000_000_000)).toBe('1T');
    });

    it('uses the largest exact unit and keeps a grouped remainder', () => {
        expect(formatLimit(1_234_000)).toBe('1,234K');
    });

    it('falls back to a grouped number when not an exact multiple', () => {
        expect(formatLimit(500)).toBe('500');
        expect(formatLimit(1500)).toBe('1,500');
        expect(formatLimit(2025)).toBe('2,025');
    });
});

describe('formatUsage', () => {
    it('leaves values under 1000 as grouped numbers', () => {
        expect(formatUsage(0)).toBe('0');
        expect(formatUsage(999)).toBe('999');
    });

    it('abbreviates any value at or above 1000 (rounded, no fraction)', () => {
        expect(formatUsage(1000)).toBe('1K');
        expect(formatUsage(1234)).toBe('1K');
        expect(formatUsage(1_000_000)).toBe('1M');
        expect(formatUsage(2_000_000_000)).toBe('2B');
        expect(formatUsage(1_000_000_000_000)).toBe('1T');
    });
});
