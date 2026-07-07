import { colorsForValues, REST_SERIES_COLOR, REST_SERIES_KEY } from '../../../components/patterns/chart/usageChartColors';
import { formatDimensionValue } from './usageBreakdown';

import type { ChartSeries } from '../../../components/patterns/chart/types';
import type { AnyBreakdownDimension } from './usageBreakdown';
import type { BillingUsageMetric } from '@nangohq/types';

/**
 * Map breakdown entries to stacked chart series: largest usage first, with the 'rest' rollup last.
 * `labelForValue` turns a raw dim value into its display label; it defaults to `formatDimensionValue`
 * but callers pass a resolver for dimensions whose stored value isn't the label (e.g. `environment_id`,
 * whose value is an id resolved to a name via top-dimension-values).
 */
export function toChartSeries(
    entries: BillingUsageMetric[],
    dimension: AnyBreakdownDimension,
    labelForValue: (value: string) => string = (value) => formatDimensionValue(dimension, value)
): ChartSeries[] {
    const ranked = entries.filter((e) => !e.isRest).sort((a, b) => b.total - a.total);
    const labels = ranked.map((entry) => (entry.group ? labelForValue(entry.group.value) : '—'));
    // Resolve all of this chart's colors at once so no two series share a color (see colorsForValues).
    const colors = colorsForValues(labels, dimension);
    const series: ChartSeries[] = ranked.map((entry, i) => {
        const label = labels[i];
        // `value` is the raw dim value (not the formatted label) so drill-in builds a valid filter param.
        return { key: `s${i}`, color: colors.get(label) ?? REST_SERIES_COLOR, label, usage: entry.usage, value: entry.group?.value };
    });
    const rest = entries.find((e) => e.isRest);
    if (rest) {
        // Appended last so the legend lists it after the named series; ChartCard then
        // renders it at the bottom of the stack. Not drillable (it's an aggregate).
        series.push({ key: REST_SERIES_KEY, label: 'Rest', color: REST_SERIES_COLOR, usage: rest.usage, isRest: true });
    }
    return series;
}
