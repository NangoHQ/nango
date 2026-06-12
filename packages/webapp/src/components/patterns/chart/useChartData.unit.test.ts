import { describe, expect, it } from 'vitest';

import { buildBaseChartData, buildBreakdownChartData, daysInTimeframe, isBaseUsageEmpty } from './useChartData.js';

import type { ChartSeries } from './types.js';
import type { ApiBillingUsageMetric } from '@nangohq/types';

// June 2026: 30 days, end-exclusive. "Today" is mid-month so we exercise past / present / future.
const JUNE = { start: '2026-06-01T00:00:00.000Z', end: '2026-07-01T00:00:00.000Z' };
const TODAY = '2026-06-15';

/** Minimal metric fixture; usage entries are serialized as strings in the real API response. */
function metric(usage: { timeframeStart: string | Date; quantity: number }[]): ApiBillingUsageMetric {
    return {
        externalId: 'm',
        label: 'Test',
        total: usage.reduce((sum, u) => sum + u.quantity, 0),
        view_mode: 'periodic',
        usage: usage.map((u) => ({ ...u, timeframeEnd: u.timeframeStart }))
    } as ApiBillingUsageMetric;
}

function series(key: string, usage: { timeframeStart: string; quantity: number }[]): ChartSeries {
    return { key, label: key, color: '#000', usage };
}

describe('daysInTimeframe', () => {
    it('returns every UTC day, end-exclusive', () => {
        const days = daysInTimeframe(JUNE);
        expect(days).toHaveLength(30);
        expect(days[0]).toBe('2026-06-01');
        expect(days[29]).toBe('2026-06-30');
        expect(days).not.toContain('2026-07-01'); // end is exclusive
    });

    it('handles a 31-day month', () => {
        expect(daysInTimeframe({ start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' })).toHaveLength(31);
    });
});

describe('buildBaseChartData', () => {
    it('returns [] when the metric has not loaded', () => {
        expect(buildBaseChartData(undefined, JUNE, TODAY)).toEqual([]);
    });

    it('blanks (null) days after today rather than plotting 0', () => {
        const rows = buildBaseChartData(metric([]), JUNE, TODAY);
        expect(rowFor(rows, '2026-06-16').total).toBeNull();
        expect(rowFor(rows, '2026-06-30').total).toBeNull();
    });

    it('keeps a genuine past 0 (distinct from a missing day)', () => {
        const rows = buildBaseChartData(metric([{ timeframeStart: '2026-06-10T00:00:00.000Z', quantity: 0 }]), JUNE, TODAY);
        expect(rowFor(rows, '2026-06-10').total).toBe(0); // present in the data → kept
        expect(rowFor(rows, '2026-06-11').total).toBeUndefined(); // absent from the data → undefined
    });

    it('includes today (not blanked) and reads its value', () => {
        const rows = buildBaseChartData(metric([{ timeframeStart: `${TODAY}T00:00:00.000Z`, quantity: 7 }]), JUNE, TODAY);
        expect(rowFor(rows, TODAY).total).toBe(7);
    });

    it('maps timeframeStart whether it is a string or a Date', () => {
        const rows = buildBaseChartData(metric([{ timeframeStart: new Date('2026-06-05T00:00:00.000Z'), quantity: 3 }]), JUNE, TODAY);
        expect(rowFor(rows, '2026-06-05').total).toBe(3);
    });
});

describe('buildBreakdownChartData', () => {
    it('returns [] when there are no series', () => {
        expect(buildBreakdownChartData(undefined, JUNE, TODAY)).toEqual([]);
    });

    it('blanks future days but grounds missing past days at 0', () => {
        const rows = buildBreakdownChartData([series('s0', [{ timeframeStart: '2026-06-05T00:00:00.000Z', quantity: 4 }])], JUNE, TODAY);
        expect(rowFor(rows, '2026-06-05').s0).toBe(4); // present
        expect(rowFor(rows, '2026-06-06').s0).toBe(0); // missing past → grounded at 0
        expect(rowFor(rows, '2026-06-16').s0).toBeNull(); // future → blank
    });

    it('keys each series independently on every row', () => {
        const rows = buildBreakdownChartData(
            [
                series('s0', [{ timeframeStart: '2026-06-05T00:00:00.000Z', quantity: 4 }]),
                series('s1', [{ timeframeStart: '2026-06-05T00:00:00.000Z', quantity: 9 }])
            ],
            JUNE,
            TODAY
        );
        const row = rowFor(rows, '2026-06-05');
        expect(row).toMatchObject({ date: '2026-06-05', s0: 4, s1: 9 });
    });
});

describe('isBaseUsageEmpty', () => {
    it('is false before the metric loads, even though the row array is empty', () => {
        // Regression guard: [].every(...) is vacuously true, which would wrongly collapse the card pre-load.
        expect(isBaseUsageEmpty(undefined, [])).toBe(false);
    });

    it('is true when a loaded metric has no usage', () => {
        const data = metric([]);
        expect(isBaseUsageEmpty(data, buildBaseChartData(data, JUNE, TODAY))).toBe(true);
    });

    it('is false when any day has usage', () => {
        const data = metric([{ timeframeStart: '2026-06-10T00:00:00.000Z', quantity: 5 }]);
        expect(isBaseUsageEmpty(data, buildBaseChartData(data, JUNE, TODAY))).toBe(false);
    });
});

function rowFor<T extends Record<string, unknown>>(rows: T[], date: string): T {
    const row = rows.find((r) => r.date === date);
    if (!row) throw new Error(`no row for ${date}`);
    return row;
}
