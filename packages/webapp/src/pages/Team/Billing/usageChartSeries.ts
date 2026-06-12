import { formatDimensionValue } from './usageBreakdown';
import { REST_SERIES_COLOR, REST_SERIES_KEY, colorsForValues } from '../../../components/patterns/chart/usageChartColors';

import type { AnyBreakdownDimension } from './usageBreakdown';
import type { ChartSeries } from '../../../components/patterns/chart/types';
import type { BillingUsageMetric } from '@nangohq/types';

/** Map breakdown entries to stacked chart series: largest usage first, with the 'rest' rollup last. */
export function toChartSeries(entries: BillingUsageMetric[], dimension: AnyBreakdownDimension): ChartSeries[] {
    const ranked = entries.filter((e) => !e.isRest).sort((a, b) => b.total - a.total);
    const labels = ranked.map((entry) => (entry.group ? formatDimensionValue(dimension, entry.group.value) : '—'));
    // Resolve all of this chart's colors at once so no two series share a color (see colorsForValues).
    const colors = colorsForValues(labels, dimension);
    const series: ChartSeries[] = ranked.map((entry, i) => {
        const label = labels[i];
        return { key: `s${i}`, color: colors.get(label) ?? REST_SERIES_COLOR, label, usage: entry.usage };
    });
    const rest = entries.find((e) => e.isRest);
    if (rest) {
        // Appended last so the legend lists it after the named series; ChartCard then
        // renders it at the bottom of the stack.
        series.push({ key: REST_SERIES_KEY, label: 'Rest', color: REST_SERIES_COLOR, usage: rest.usage });
    }
    return series;
}
