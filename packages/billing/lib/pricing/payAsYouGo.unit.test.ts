import { describe, expect, it } from 'vitest';

import { projectPayAsYouGo } from './payAsYouGo.js';

import type { PayAsYouGoQuantities } from './payAsYouGo.js';

function quantities(overrides: Partial<PayAsYouGoQuantities> = {}): PayAsYouGoQuantities {
    return { connections: 0, function_duration_seconds: 0, data_transfer: 0, ...overrides };
}

describe('projectPayAsYouGo', () => {
    it('prices each metric in the unit its rate is published in', () => {
        const projection = projectPayAsYouGo(
            quantities({
                connections: 34,
                function_duration_seconds: 231_480, // 64.3 hours
                data_transfer: 12_400_000_000 // 12.4 GB
            }),
            { isGrowth: false }
        );

        expect(projection.metrics).toEqual({
            connections: 986, // 34 x $0.29
            function_duration_seconds: 4630, // 64.3h x $0.72
            data_transfer: 620 // 12.4GB x $0.50
        });
        expect(projection.subtotalInCents).toBe(6236);
    });

    it('bills the subtotal once it clears the minimum', () => {
        const projection = projectPayAsYouGo(quantities({ connections: 1000 }), { isGrowth: false });

        expect(projection.subtotalInCents).toBe(29_000);
        expect(projection.minimumApplied).toBe(false);
        expect(projection.totalInCents).toBe(29_000);
    });

    it('floors a light period at the minimum without touching the per-metric rows', () => {
        const projection = projectPayAsYouGo(quantities({ connections: 10 }), { isGrowth: false });

        expect(projection.metrics.connections).toBe(290);
        expect(projection.subtotalInCents).toBe(290);
        expect(projection.minimumApplied).toBe(true);
        expect(projection.totalInCents).toBe(5000);
    });

    it('adds the Growth add-on on top of the minimum, not inside it', () => {
        const projection = projectPayAsYouGo(quantities({ connections: 10 }), { isGrowth: true });

        expect(projection.growthAddOnInCents).toBe(45_000);
        expect(projection.totalInCents).toBe(50_000);
    });

    it('leaves the add-on out for a plan that does not carry it', () => {
        expect(projectPayAsYouGo(quantities({ connections: 1000 }), { isGrowth: false }).growthAddOnInCents).toBe(0);
    });

    it('keeps the rows adding up to the subtotal even when each one rounds', () => {
        const projection = projectPayAsYouGo(
            quantities({
                connections: 3.456,
                function_duration_seconds: 1234,
                data_transfer: 987_654_321
            }),
            { isGrowth: false }
        );

        const summed = projection.metrics.connections + projection.metrics.function_duration_seconds + projection.metrics.data_transfer;
        expect(projection.subtotalInCents).toBe(summed);
    });

    it('reports zero usage as a real $0 rather than a gap', () => {
        const projection = projectPayAsYouGo(quantities(), { isGrowth: false });

        expect(projection.subtotalInCents).toBe(0);
        expect(projection.minimumApplied).toBe(true);
        expect(projection.totalInCents).toBe(5000);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('refuses to quote a bill from an unusable quantity (%s)', (value) => {
        expect(() => projectPayAsYouGo(quantities({ function_duration_seconds: value }), { isGrowth: false })).toThrow(
            'unusable_quantity_for_function_duration_seconds'
        );
    });
});
