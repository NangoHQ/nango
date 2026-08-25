import { beforeEach, describe, expect, it } from 'vitest';

import { colorsForValues, resetUsageChartColorsForTests } from './usageChartColors.js';

describe('colorsForValues', () => {
    beforeEach(() => resetUsageChartColorsForTests());

    describe('success dimension', () => {
        it('uses the semantic danger color for Failed and success color for everything else', () => {
            const colors = colorsForValues(['Failed', 'Success'], 'success');
            expect(colors.get('Failed')).toBe('var(--color-icon-danger)');
            expect(colors.get('Success')).toBe('var(--color-icon-success)');
        });

        it('does not consume palette slots (so it never affects other dimensions)', () => {
            colorsForValues(['Failed', 'Success'], 'success');
            // The first palette dimension value still gets the first palette color.
            const colors = colorsForValues(['first', 'second'], 'integration_id');
            const reference = colorsForValues(['first'], 'integration_id');
            expect(colors.get('first')).toBe(reference.get('first'));
            expect(colors.get('first')).not.toBe(colors.get('second'));
        });
    });

    describe('palette dimensions', () => {
        it('returns the same color for the same value across charts (stable)', () => {
            const first = colorsForValues(['attio'], 'integration_id').get('attio');
            const second = colorsForValues(['attio'], 'integration_id').get('attio');
            expect(first).toBe(second);
        });

        it('gives every series in a single 10-value chart a distinct color', () => {
            const values = Array.from({ length: 10 }, (_, i) => `v${i}`);
            const colors = colorsForValues(values, 'integration_id');
            expect(new Set(colors.values()).size).toBe(10);
        });

        it('scopes assignments per dimension (the first value in each dimension gets the first color)', () => {
            const integration = colorsForValues(['acme'], 'integration_id').get('acme');
            const model = colorsForValues(['gpt-4'], 'model').get('gpt-4');
            expect(integration).toBe(model);
        });

        it('maps a duplicated label to a single color without consuming two slots', () => {
            const colors = colorsForValues(['a', 'a', 'b'], 'integration_id');
            expect(colors.get('a')).not.toBe(colors.get('b'));
            expect(colors.size).toBe(2);
        });

        describe('de-confliction past the palette size', () => {
            // Exhaust the palette so two values (v0 and v10) share a stable color, then chart them together.
            beforeEach(() =>
                colorsForValues(
                    Array.from({ length: 11 }, (_, i) => `v${i}`),
                    'integration_id'
                )
            );

            it('keeps colors distinct within a chart even when two values share a stable color', () => {
                const colors = colorsForValues(['v0', 'v10'], 'integration_id');
                expect(colors.get('v0')).not.toBe(colors.get('v10'));
            });

            it('keeps the higher-ranked value on its stable color and bumps the lower-ranked one', () => {
                const stableV0 = colorsForValues(['v0'], 'integration_id').get('v0');
                // v0 is listed first (higher rank), so it keeps its stable color; v10 is bumped.
                const colors = colorsForValues(['v0', 'v10'], 'integration_id');
                expect(colors.get('v0')).toBe(stableV0);
                expect(colors.get('v10')).not.toBe(stableV0);
            });

            it('does not bump a value in a chart where its stable color is free', () => {
                const stableV10 = colorsForValues(['v10'], 'integration_id').get('v10');
                // Without the colliding v0 present, v10 keeps its stable color.
                expect(stableV10).toBe(colorsForValues(['v10'], 'integration_id').get('v10'));
            });
        });

        it('does not throw when a chart has more values than the palette', () => {
            const values = Array.from({ length: 13 }, (_, i) => `v${i}`);
            expect(() => colorsForValues(values, 'integration_id')).not.toThrow();
            // The 10 palette colors are all used; beyond that the palette necessarily repeats.
            expect(new Set(colorsForValues(values, 'integration_id').values()).size).toBe(10);
        });
    });

    it('reset clears assignments so a fresh value takes the first slot again', () => {
        const firstSlot = colorsForValues(['alpha'], 'integration_id').get('alpha');
        resetUsageChartColorsForTests();
        expect(colorsForValues(['beta'], 'integration_id').get('beta')).toBe(firstSlot);
    });
});
