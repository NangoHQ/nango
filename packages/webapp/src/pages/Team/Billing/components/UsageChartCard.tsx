import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { ChartCard } from '@/components/patterns/chart';
import { colorsForValues } from '@/components/patterns/chart/usageChartColors';
import { useApiGetBillingUsageDetail } from '@/hooks/usePlan';
import { BREAKDOWN_DIMENSIONS, DEFAULT_TOP_N, formatDimensionValue } from '../usageBreakdown';
import { toChartSeries } from '../usageChartSeries';
import { useBreakdownEnabled } from '../useBreakdownEnabled';
import { BreakdownFilterControl } from './BreakdownFilterControl';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { GroupFilterSelection } from '../useGlobalGroupFilter';
import type { ChartSeries } from '@/components/patterns/chart';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

const NONE = 'none';

interface UsageChartCardProps {
    metric: UsageMetric;
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    /** Returns true if applying this panel's group + filter would change at least one other applicable panel. */
    isDivergingFromGlobal: (metric: UsageMetric, selection: GroupFilterSelection) => boolean;
    /** Apply this panel's group + filter to every applicable metric. */
    onApplyToAll: (selection: GroupFilterSelection) => void;
}

/**
 * Parse a `${metric}.filter` param value (`<dim>:<value>`) into its parts.
 * Splits on the FIRST ':' to mirror the backend so values containing ':' (e.g.
 * URLs) survive intact. Returns null for malformed input or a dim the metric
 * doesn't support (e.g. a stale deep-link after the dimension list changed).
 */
function parseFilterParam(raw: string, allowed: readonly AnyBreakdownDimension[]): { dimension: AnyBreakdownDimension; value: string } | null {
    const colon = raw.indexOf(':');
    if (colon < 1 || colon === raw.length - 1) return null;
    const dimension = raw.slice(0, colon) as AnyBreakdownDimension;
    const value = raw.slice(colon + 1);
    if (!allowed.includes(dimension)) return null;
    return { dimension, value };
}

/**
 * One billing usage panel: the base single-series chart, plus — when the breakdown
 * view is enabled — drill-in. Break a metric down by a dimension, click a slice (its
 * band, legend funnel, or the Filter typeahead) to filter the panel to that value,
 * then optionally re-break the filtered slice down by another dimension. Filter +
 * breakdown live in the URL (`${metric}.breakdown`, `${metric}.filter`) so the state
 * is deep-linkable and survives month changes. One filter + one breakdown per panel.
 */
export const UsageChartCard: React.FC<UsageChartCardProps> = ({ metric, data, isLoading, env, timeframe, isDivergingFromGlobal, onApplyToAll }) => {
    const showControls = useBreakdownEnabled();

    const dimensions = BREAKDOWN_DIMENSIONS[metric] as readonly AnyBreakdownDimension[];

    // Each panel owns its breakdown + filter explicitly via URL params.
    const [dimParam, setDimParam] = useQueryState(`${metric}.breakdown`, parseAsString.withDefault(NONE).withOptions({ history: 'replace' }));
    const [filterParam, setFilterParam] = useQueryState(`${metric}.filter`, parseAsString.withDefault('').withOptions({ history: 'replace' }));

    const rawDimension: AnyBreakdownDimension | null = dimensions.includes(dimParam as AnyBreakdownDimension) ? (dimParam as AnyBreakdownDimension) : null;
    const filter = showControls ? parseFilterParam(filterParam, dimensions) : null;

    // A filter and a breakdown can't target the same dimension (the backend rejects it as a
    // degenerate single-value split). When they collide — e.g. you group by integration, then
    // filter to one integration that was hidden in 'Rest' — the filter wins and the grouping is
    // ignored for the query. The grouping stays in the URL, so clearing the filter restores it
    // without having to re-select it.
    const dimension = rawDimension && filter && rawDimension === filter.dimension ? null : rawDimension;

    const inBreakdownMode = showControls && dimension !== null;
    const inFilterMode = showControls && filter !== null;
    const isDetail = inBreakdownMode || inFilterMode;

    // One request covers every detail state (filtered and/or broken down). Fetched lazily.
    const detailQuery = useApiGetBillingUsageDetail(env, timeframe, metric, { dimension, filter }, DEFAULT_TOP_N, { enabled: isDetail });
    const detailMetric = detailQuery.data?.data.usage[metric];

    const breakdownEntries = detailMetric?.breakdown;
    const breakdownSeries = useMemo<ChartSeries[] | undefined>(() => {
        if (!inBreakdownMode || dimension === null) return undefined;
        return breakdownEntries ? toChartSeries(breakdownEntries, dimension) : [];
    }, [inBreakdownMode, dimension, breakdownEntries]);

    // Group and filter are independent slots, so clearing the filter only removes the filter —
    // it never touches the grouping.
    const clearFilter = () => {
        void setFilterParam(null);
    };

    // Apply a filter from the typeahead. Filtering by the dimension currently grouped by — the
    // "drill into a Rest value" case — is allowed and keeps the grouping: the two collide, so
    // the grouping is ignored for the query (see above), but it stays set so clearing the
    // filter lands back on it.
    const applyFilter = (dim: AnyBreakdownDimension, value: string) => {
        void setFilterParam(`${dim}:${value}`);
    };

    // "Apply to all" shows when applying this panel's group + filter would change another panel.
    // Use the raw (URL) grouping, not the collision-resolved one, so a panel grouped-and-
    // filtered on the same dim still propagates (and keeps) its grouping.
    const selection = { group: rawDimension, filter };
    const canApplyToAll = isDivergingFromGlobal(metric, selection);

    // The chart + headline always reflect the "live" metric being shown: the detail response
    // (filtered and/or broken down) when there is one, else the base metric. The detail metric
    // is a full ApiBillingUsageMetric (label, view_mode, and — for a breakdown — a `total`
    // that's the sum across the series), so there's no per-state headline override.
    const live = detailMetric ?? data;

    // When filtered, surface the slice's share of the metric's unfiltered total. `data` is the base
    // metric we were handed (the filter only re-queries `detailQuery`), so its total is the global
    // denominator — lets "5,813 failed" be read against the whole ("2.3% of 248,301").
    const globalTotal = inFilterMode ? data?.total : undefined;

    // Filtering without a grouping draws a single series that IS the filtered value, so colour and
    // label it like that value's breakdown slice — Status gets its semantic red/green, other
    // dimensions the value's palette colour — and surface a one-row legend, rather than the generic
    // brand-coloured "Total". (When grouped too, the breakdown series own the colours and legend.)
    let singleSeries: { label: string; color: string } | undefined;
    if (inFilterMode && !inBreakdownMode && filter) {
        const label = formatDimensionValue(filter.dimension, filter.value);
        singleSeries = { label, color: colorsForValues([label], filter.dimension).get(label) ?? 'var(--ds-color-brand-500)' };
    }

    // No data at all for this metric (ignoring filters) → nothing to slice, so hide the controls.
    // If it's only empty because of the active filter, keep them in so the filter can be cleared.
    const baseEmpty = !data || data.usage.every((u) => !u.quantity);
    const headerActions =
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
                onApplyToAll={() => onApplyToAll(selection)}
            />
        ) : undefined;

    return (
        <ChartCard
            data={live}
            isLoading={isLoading}
            timeframe={timeframe}
            headerActions={headerActions}
            breakdownSeries={breakdownSeries}
            detailLoading={isDetail ? detailQuery.isLoading : false}
            detailError={isDetail ? detailQuery.isError : false}
            filtered={inFilterMode}
            globalTotal={globalTotal}
            singleSeries={singleSeries}
        />
    );
};
