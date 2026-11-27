import { describe, expect, it } from 'vitest';

import { formatDuration, formatElapsed, formatOperationTime } from './format.js';

describe('formatElapsed', () => {
    it('counts whole seconds, then switches to minutes', () => {
        expect(formatElapsed(12_900)).toBe('12s');
        expect(formatElapsed(-5)).toBe('0s');
        expect(formatElapsed(125_400)).toBe(formatDuration(125_400));
    });
});

describe('formatOperationTime', () => {
    const now = new Date('2026-11-27T15:00:00');

    it('shows only the time for today', () => {
        expect(formatOperationTime('2026-11-27T14:29:22', now)).toBe('14:29:22');
    });

    it('adds the date for an earlier day', () => {
        expect(formatOperationTime('2026-11-25T09:05:00', now)).toBe('Nov 25 09:05:00');
    });
});

describe('formatDuration', () => {
    it('picks the unit from the size', () => {
        expect(formatDuration(283)).toBe('283ms');
        expect(formatDuration(2345)).toBe('2.3s');
    });

    it('shows a negative duration from out-of-order timestamps as zero', () => {
        expect(formatDuration(-40)).toBe('0ms');
    });
});
