import { beforeEach, describe, expect, it } from 'vitest';

import { resetUsageChartColorsForTests, REST_SERIES_COLOR, REST_SERIES_KEY } from '../../../components/patterns/chart/usageChartColors.js';
import { toChartSeries } from './usageChartSeries.js';

import type { BillingUsageMetric } from '@nangohq/types';

/** Breakdown entry fixture; `value` undefined → an entry with no `group`. */
function entry({ value, total, isRest }: { value?: string; total: number; isRest?: true }): BillingUsageMetric {
    return {
        externalId: value ?? 'rest',
        group: value === undefined ? undefined : { key: 'integration_id', value },
        ...(isRest ? { isRest } : {}),
        total,
        view_mode: 'periodic',
        usage: [{ timeframeStart: new Date('2026-06-01T00:00:00.000Z'), timeframeEnd: new Date('2026-06-02T00:00:00.000Z'), quantity: total }]
    };
}

describe('toChartSeries', () => {
    // Color assignment keeps a per-dimension module-level map; reset it so color assertions aren't order-dependent.
    beforeEach(() => resetUsageChartColorsForTests());

    it('ranks named series by total descending and keys them s0, s1, …', () => {
        const series = toChartSeries([entry({ value: 'b', total: 3 }), entry({ value: 'a', total: 10 }), entry({ value: 'c', total: 5 })], 'integration_id');
        expect(series.map((s) => s.label)).toEqual(['a', 'c', 'b']);
        expect(series.map((s) => s.key)).toEqual(['s0', 's1', 's2']);
    });

    it('appends the rest rollup last with its reserved key, label and neutral color', () => {
        const series = toChartSeries([entry({ value: 'a', total: 10 }), entry({ total: 2, isRest: true })], 'integration_id');
        const last = series[series.length - 1];
        expect(last).toMatchObject({ key: REST_SERIES_KEY, label: 'Rest', color: REST_SERIES_COLOR });
        // rest never competes for an s-index
        expect(series.filter((s) => s.key.startsWith('s'))).toHaveLength(1);
    });

    it('falls back to an em dash when an entry has no group', () => {
        const series = toChartSeries([entry({ total: 4 })], 'integration_id');
        expect(series[0].label).toBe('—');
    });

    it('labels the success dimension as Success / Failed', () => {
        const series = toChartSeries([entry({ value: 'true', total: 8 }), entry({ value: 'false', total: 3 })], 'success');
        expect(series.map((s) => s.label)).toEqual(['Success', 'Failed']);
    });

    it('gives the same dimension value a stable color and distinct values distinct colors', () => {
        const series = toChartSeries([entry({ value: 'a', total: 8 }), entry({ value: 'b', total: 3 })], 'integration_id');
        const again = toChartSeries([entry({ value: 'a', total: 1 })], 'integration_id');
        const [a, b] = series;
        expect(a.color).not.toBe(b.color);
        expect(again[0].color).toBe(a.color); // 'a' keeps its color across charts
    });

    it('carries each entry usage array through to its series', () => {
        const e = entry({ value: 'a', total: 8 });
        expect(toChartSeries([e], 'integration_id')[0].usage).toBe(e.usage);
    });
});
