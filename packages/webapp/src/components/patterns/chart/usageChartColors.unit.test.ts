import { beforeEach, describe, expect, it } from 'vitest';

import { colorForValue, resetUsageChartColorsForTests } from './usageChartColors.js';

describe('colorForValue', () => {
    beforeEach(() => resetUsageChartColorsForTests());

    describe('success dimension', () => {
        it('uses the semantic danger color for Failed and success color for everything else', () => {
            expect(colorForValue('Failed', 'success')).toBe('var(--color-icon-danger)');
            expect(colorForValue('Success', 'success')).toBe('var(--color-icon-success)');
        });

        it('does not consume palette slots (so it never affects other dimensions)', () => {
            colorForValue('Failed', 'success');
            colorForValue('Success', 'success');
            // First palette dimension value still gets the first palette color.
            expect(colorForValue('first')).toBe(colorForValue('first'));
            expect(colorForValue('second')).not.toBe(colorForValue('first'));
        });
    });

    describe('palette dimensions', () => {
        it('returns the same color for the same value (stable across charts)', () => {
            expect(colorForValue('attio')).toBe(colorForValue('attio'));
        });

        it('assigns distinct colors to the first 10 distinct values', () => {
            const colors = Array.from({ length: 10 }, (_, i) => colorForValue(`v${i}`));
            expect(new Set(colors).size).toBe(10);
        });

        it('cycles the palette once exhausted (the 11th value reuses the 1st color)', () => {
            const first = colorForValue('v0');
            for (let i = 1; i < 10; i++) colorForValue(`v${i}`);
            expect(colorForValue('v10')).toBe(first);
        });
    });

    it('reset clears assignments so a fresh value takes the first slot again', () => {
        const firstSlot = colorForValue('alpha');
        resetUsageChartColorsForTests();
        expect(colorForValue('beta')).toBe(firstSlot);
    });
});
