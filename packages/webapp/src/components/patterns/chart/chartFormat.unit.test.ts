import { describe, expect, it } from 'vitest';

import { formatExact, formatShare } from './chartFormat.js';

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
