import { describe, expect, it } from 'vitest';

import { formatExact, formatShare, niceCapAxis, niceStep } from './chartFormat.js';

describe('formatExact', () => {
    it('groups thousands and keeps up to two decimals', () => {
        expect(formatExact(271916)).toBe('271,916');
        expect(formatExact(2172.434)).toBe('2,172.43');
        expect(formatExact(0)).toBe('0');
    });
});

describe('formatShare', () => {
    it('renders the share to one decimal place', () => {
        expect(formatShare(14440, 271916)).toBe('5.3%');
        expect(formatShare(500, 1000)).toBe('50%');
    });

    it('rounds to one decimal', () => {
        expect(formatShare(2346, 100000)).toBe('2.3%');
    });

    it('shows <0.1% for a tiny but non-zero slice instead of rounding to 0%', () => {
        expect(formatShare(1, 100000)).toBe('<0.1%');
    });

    it('shows 0% for an empty slice', () => {
        expect(formatShare(0, 271916)).toBe('0%');
    });
});

describe('niceStep', () => {
    it('rounds up to the nearest 1/2/2.5/5/10 × 10ⁿ', () => {
        expect(niceStep(1)).toBe(1);
        expect(niceStep(1.5)).toBe(2);
        expect(niceStep(2.1)).toBe(2.5);
        expect(niceStep(3)).toBe(5);
        expect(niceStep(6)).toBe(10);
        expect(niceStep(20000)).toBe(20000);
        expect(niceStep(21000)).toBe(25000);
    });

    it('returns 1 for non-positive input (guards log10(0) → NaN)', () => {
        expect(niceStep(0)).toBe(1);
        expect(niceStep(-5)).toBe(1);
    });
});

describe('niceCapAxis', () => {
    it('produces round ticks ending at/above the cap with ~10% headroom', () => {
        const { max, ticks } = niceCapAxis(80_000, 100_000);
        expect(ticks).toEqual([0, 20_000, 40_000, 60_000, 80_000, 100_000]);
        expect(ticks).toContain(100_000); // cap is a labelled tick
        expect(max).toBeCloseTo(110_000); // headroom above the top
    });

    it('forces an off-grid cap in as its own tick', () => {
        const { ticks } = niceCapAxis(5_000, 11_200);
        expect(ticks).toContain(11_200);
        // stays sorted after the cap is spliced in
        expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    });

    it('scales the axis to the data when usage exceeds the cap', () => {
        const { max, ticks } = niceCapAxis(250_000, 100_000);
        expect(Math.max(...ticks)).toBeGreaterThanOrEqual(250_000);
        expect(ticks).toContain(100_000); // cap still labelled, low on the axis
        expect(max).toBeCloseTo(275_000);
    });

    it('never produces a zero step for tiny values', () => {
        const { ticks } = niceCapAxis(0, 1);
        expect(ticks.length).toBeGreaterThan(1);
        expect(ticks[0]).toBe(0);
    });

    it('keeps every tick within the domain when the step overshoots', () => {
        // Regression: dataMax 130 / cap 100 → step 50 used to emit a 150 tick past the 143 ceiling.
        const { max, ticks } = niceCapAxis(130, 100);
        expect(Math.max(...ticks)).toBeLessThanOrEqual(max);
        expect(ticks).toContain(100); // cap still labelled
    });
});
