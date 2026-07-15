import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';

import { ChartCard } from '@/components/patterns/chart';
import { colorsForValues } from '@/components/patterns/chart/usageChartColors';
import { useApiGetBillingUsageDetail } from '@/hooks/usePlan';
import { track } from '@/utils/analytics';
import { BREAKDOWN_DIMENSIONS, DEFAULT_TOP_N, formatDimensionValue, parseFilterParam, resolveBreakdownDimension } from '../usageBreakdown';
import { toChartSeries } from '../usageChartSeries';
import { useBreakdownEnabled } from '../useBreakdownEnabled';
import { BreakdownFilterControl } from './BreakdownFilterControl';
import { ChartModeToggle } from './ChartModeToggle';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { GroupFilterSelection } from '../useGlobalGroupFilter';
import type { ChartMode } from './ChartModeToggle';
import type { ChartSeries } from '@/components/patterns/chart';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

/** Sentinel for the `${metric}.breakdown` URL param when no grouping is selected. */
const NONE = 'none';

interface UsageChartCardProps {
    metric: UsageMetric;
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    /** Returns true if applying this panel's group + filter would change at least one other applicable panel.
     *  Optional: the Free caps view sets `disableApplyToAll`, so its panels don't wire this up. */
    isDivergingFromGlobal?: (metric: UsageMetric, selection: GroupFilterSelection) => boolean;
    /** Apply this panel's group + filter to every applicable metric. Optional alongside `disableApplyToAll`. */
    onApplyToAll?: (selection: GroupFilterSelection) => void;
    /** Drop the ChartCard's own label + total header (an outer row already shows them). */
    hideHeader?: boolean;
    /** Extra controls placed after the breakdown Group/Filter cluster (e.g. a month stepper). */
    extraHeaderActions?: React.ReactNode;
    /** Hide the "Apply to all" affordance (e.g. the Free caps view, where panels are independent). */
    disableApplyToAll?: boolean;
    /** Draw a cap reference line at the metric's plan limit (Free caps view). */
    capLine?: number;
    /** 'cumulative' plots counter metrics as a running month-to-date total (Free caps view). */
    chartMode?: 'daily' | 'cumulative';
    /** Request AVG metrics as point-in-time daily counts instead of the billing running-average. */
    pointInTime?: boolean;
}

/**
 * One billing usage panel: the base single-series chart, plus — when the breakdown
 * view is enabled — drill-in. Break a metric down by a dimension, click a slice (its
 * band, legend funnel, or the Filter typeahead) to filter the panel to that value,
 * then optionally re-break the filtered slice down by another dimension. Filter +
 * breakdown live in the URL (`${metric}.breakdown`, `${metric}.filter`) so the state
 * is deep-linkable and survives month changes. One filter + one breakdown per panel.
 */
export const UsageChartCard: React.FC<UsageChartCardProps> = ({
    metric,
    data,
    isLoading,
    env,
    timeframe,
    isDivergingFromGlobal,
    onApplyToAll,
    hideHeader,
    extraHeaderActions,
    disableApplyToAll,
    capLine,
    chartMode,
    pointInTime
}) => {
    const showControls = useBreakdownEnabled();

    const dimensions = BREAKDOWN_DIMENSIONS[metric] as readonly AnyBreakdownDimension[];

    // Each panel owns its breakdown + filter explicitly via URL params.
    const [dimParam, setDimParam] = useQueryState(`${metric}.breakdown`, parseAsString.withDefault(NONE).withOptions({ history: 'replace' }));
    const [filterParam, setFilterParam] = useQueryState(`${metric}.filter`, parseAsString.withDefault('').withOptions({ history: 'replace' }));

    const rawDimension: AnyBreakdownDimension | null = dimensions.includes(dimParam as AnyBreakdownDimension) ? (dimParam as AnyBreakdownDimension) : null;
    const filter = showControls ? parseFilterParam(filterParam, dimensions) : null;

    // Group + filter on the same dimension collide; the filter wins for the query (see
    // resolveBreakdownDimension), while rawDimension keeps the grouping in the URL.
    const dimension = resolveBreakdownDimension(rawDimension, filter);

    const inBreakdownMode = showControls && dimension !== null;
    const inFilterMode = showControls && filter !== null;
    const isDetail = inBreakdownMode || inFilterMode;

    // One request covers every detail state (filtered and/or broken down). Fetched lazily.
    const detailQuery = useApiGetBillingUsageDetail(env, timeframe, metric, { dimension, filter }, DEFAULT_TOP_N, { enabled: isDetail, pointInTime });
    const detailMetric = detailQuery.data?.data.usage[metric];

    const breakdownEntries = detailMetric?.breakdown;
    const breakdownSeries = useMemo<ChartSeries[] | undefined>(() => {
        if (!inBreakdownMode || dimension === null) return undefined;
        return breakdownEntries ? toChartSeries(breakdownEntries, dimension) : [];
    }, [inBreakdownMode, dimension, breakdownEntries]);

    // Group and filter are independent slots: clearing the filter leaves the grouping untouched.
    const clearFilter = () => {
        track('web:usage:filter_cleared', { metric });
        void setFilterParam(null);
    };
    // Filtering by the grouped dimension is allowed (the "drill into a Rest value" case); the
    // collision is resolved for the query while the grouping stays set in the URL.
    const applyFilter = (dim: AnyBreakdownDimension, value: string) => {
        // Dimension only — filter values can be connection/environment identifiers.
        track('web:usage:filtered', { metric, dimension: dim });
        void setFilterParam(`${dim}:${value}`);
    };

    // "Apply to all" uses the raw (URL) grouping, not the collision-resolved one, so a panel
    // grouped-and-filtered on the same dimension still propagates and keeps its grouping.
    const selection = { group: rawDimension, filter };
    const canApplyToAll = !disableApplyToAll && (isDivergingFromGlobal?.(metric, selection) ?? false);

    // Show the detail response (filtered and/or broken down) when there is one, else the base
    // metric. Both are full ApiBillingUsageMetrics, so the headline needs no per-state override.
    const live = detailMetric ?? data;

    // When filtered, the headline shows its share of the metric's unfiltered total. `data` is that
    // unfiltered base (the filter only re-queries detailQuery), so its total is the denominator.
    const globalTotal = inFilterMode ? data?.total : undefined;

    // A filter without a grouping draws one series that IS the filtered value, so colour + label it
    // like that value's breakdown slice (Status → semantic red/green, else its palette colour) with
    // a one-row legend. When also grouped, the breakdown series own the colours and legend.
    let singleSeries: { label: string; color: string } | undefined;
    if (inFilterMode && !inBreakdownMode && filter) {
        const label = formatDimensionValue(filter.dimension, filter.value);
        singleSeries = { label, color: colorsForValues([label], filter.dimension).get(label) ?? 'var(--ds-color-brand-500)' };
    }

    // No data at all for this metric (ignoring filters) → nothing to slice, so hide the controls.
    // If it's only empty because of the active filter, keep them in so the filter can be cleared.
    // Counter metrics can toggle cumulative ↔ daily; AVG metrics (view_mode 'cumulative') are a
    // level series with no daily equivalent, so they don't get the toggle. Defaults from the prop.
    const [chartModeState, setChartModeState] = useState<ChartMode>(chartMode ?? 'daily');
    const isCounter = data?.view_mode === 'periodic';

    const baseEmpty = !data || data.usage.every((u) => !u.quantity);
    // The daily/cumulative toggle is a chart-mode control, not a breakdown feature — show it whenever
    // a chartMode is explicitly supplied (Free), independent of the breakdown rollout flag.
    const canToggleMode = chartMode !== undefined || showControls;
    const viewToggle = canToggleMode && isCounter && !baseEmpty ? <ChartModeToggle mode={chartModeState} onChange={setChartModeState} /> : null;
    const breakdownControl =
        showControls && !baseEmpty ? (
            <BreakdownFilterControl
                metric={metric}
                env={env}
                timeframe={timeframe}
                dimensions={dimensions}
                breakdownDimension={rawDimension}
                filter={filter}
                onSetBreakdown={(d) => void setDimParam(d)}
                onApplyFilter={applyFilter}
                onClearFilter={clearFilter}
                canApplyToAll={canApplyToAll}
                onApplyToAll={() => {
                    track('web:usage:applied_to_all', {
                        metric,
                        group_dimension: rawDimension ?? 'none',
                        filter_dimension: filter?.dimension ?? 'none'
                    });
                    onApplyToAll?.(selection);
                }}
            />
        ) : null;
    return (
        <ChartCard
            data={live}
            isLoading={isLoading}
            timeframe={timeframe}
            headerActions={
                breakdownControl || viewToggle ? (
                    <>
                        {breakdownControl}
                        {viewToggle}
                    </>
                ) : undefined
            }
            extraHeaderActions={extraHeaderActions}
            hideHeader={hideHeader}
            breakdownSeries={breakdownSeries}
            detailLoading={isDetail ? detailQuery.isLoading : false}
            detailError={isDetail ? detailQuery.isError : false}
            filtered={inFilterMode}
            globalTotal={globalTotal}
            singleSeries={singleSeries}
            onSeriesIsolate={() => track('web:usage:series_isolated', { metric })}
            onSeriesToggle={() => track('web:usage:series_toggled', { metric })}
            capLine={capLine}
            chartMode={chartModeState}
        />
    );
};
