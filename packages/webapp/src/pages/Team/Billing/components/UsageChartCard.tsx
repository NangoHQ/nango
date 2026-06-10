import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { BreakdownControls } from './BreakdownControls';
import { BREAKDOWN_DIMENSIONS, DEFAULT_TOP_N, formatDimensionValue, metricsSupportingDimension } from '../usageBreakdown';
import { useBreakdownEnabled } from '../useBreakdownEnabled';
import { ChartCard, REST_SERIES_COLOR, REST_SERIES_KEY, colorForValue } from '@/components/patterns/chart';
import { useApiGetBillingUsageBreakdown } from '@/hooks/usePlan';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { ChartSeries } from '@/components/patterns/chart';
import type { ApiBillingUsageMetric, BillingUsageMetric, UsageMetric } from '@nangohq/types';

const NONE = 'none';

interface UsageChartCardProps {
    metric: UsageMetric;
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    /** The current global breakdown dimension ('none' or a dim). Decides when this panel's "Apply to all" shows. */
    globalBreakdown: string;
    /** Make this panel's dimension the global one and apply it to every metric that supports it. */
    onApplyToAll: (dimension: AnyBreakdownDimension) => void;
}

/** Map breakdown entries to stacked chart series: largest usage first, with the 'rest' rollup last. */
function toChartSeries(entries: BillingUsageMetric[], dimension: AnyBreakdownDimension): ChartSeries[] {
    const ranked = entries.filter((e) => !e.isRest).sort((a, b) => b.total - a.total);
    const series: ChartSeries[] = ranked.map((entry, i) => {
        const label = entry.group ? formatDimensionValue(dimension, entry.group.value) : '—';
        return { key: `s${i}`, color: colorForValue(label, dimension), label, usage: entry.usage };
    });
    const rest = entries.find((e) => e.isRest);
    if (rest) {
        // Appended last so the legend lists it after the named series; ChartCard then
        // renders it at the bottom of the stack.
        series.push({ key: REST_SERIES_KEY, label: 'Rest', color: REST_SERIES_COLOR, usage: rest.usage });
    }
    return series;
}

/**
 * One billing usage panel: the base single-series chart, plus — when the breakdown
 * view is enabled — a dimension dropdown that stacks a per-dimension breakdown. The
 * headline total always comes from the base metric.
 */
export const UsageChartCard: React.FC<UsageChartCardProps> = ({ metric, data, isLoading, env, timeframe, globalBreakdown, onApplyToAll }) => {
    const showControls = useBreakdownEnabled();

    // This panel's selected dimension (default 'none'), persisted in the URL.
    const dimensions = BREAKDOWN_DIMENSIONS[metric] as readonly AnyBreakdownDimension[];
    const [dimParam, setDimParam] = useQueryState(`${metric}.breakdown`, parseAsString.withDefault(NONE).withOptions({ history: 'replace' }));
    const dimension: AnyBreakdownDimension | null = dimensions.includes(dimParam as AnyBreakdownDimension) ? (dimParam as AnyBreakdownDimension) : null;
    const inBreakdownMode = showControls && dimension !== null;

    const breakdownQuery = useApiGetBillingUsageBreakdown(env, timeframe, metric, dimension, DEFAULT_TOP_N, { enabled: inBreakdownMode });
    const breakdownEntries = breakdownQuery.data?.data.usage[metric]?.breakdown;

    const breakdownSeries = useMemo<ChartSeries[] | undefined>(() => {
        if (!showControls || dimension === null) return undefined;
        return breakdownEntries ? toChartSeries(breakdownEntries, dimension) : [];
    }, [showControls, dimension, breakdownEntries]);

    // "Apply to all" shows when this panel's dimension diverges from the global one and
    // more than one metric supports it.
    const canApplyToAll = dimension !== null && dimension !== globalBreakdown && metricsSupportingDimension(dimension).length > 1;

    const headerActions = showControls ? (
        <BreakdownControls
            dimensions={dimensions}
            dimension={dimension}
            onChange={(d) => void setDimParam(d)}
            canApplyToAll={canApplyToAll}
            onApplyToAll={() => dimension && onApplyToAll(dimension)}
        />
    ) : undefined;

    return (
        <ChartCard
            data={data}
            isLoading={isLoading}
            timeframe={timeframe}
            headerActions={headerActions}
            breakdownSeries={breakdownSeries}
            breakdownLoading={breakdownQuery.isLoading}
            breakdownError={breakdownQuery.isError}
        />
    );
};
