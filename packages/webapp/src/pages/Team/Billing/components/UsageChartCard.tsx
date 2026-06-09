import { Layers } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { useBreakdownFixtures } from '../fixtures/useBreakdownFixtures';
import { BREAKDOWN_DIMENSIONS, DEFAULT_TOP_N, DIMENSION_LABELS, formatDimensionValue, metricsSupportingDimension } from '../usageBreakdown';
import { useBreakdownEnabled } from '../useBreakdownEnabled';
import { ChartCard } from '@/components/patterns/ChartCard';
import { FAILED_SERIES_COLOR, REST_SERIES_COLOR, REST_SERIES_KEY, SUCCESS_SERIES_COLOR, colorForValue } from '@/components/patterns/usageChartColors';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useApiGetBillingUsageBreakdown } from '@/hooks/usePlan';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { ChartSeries } from '@/components/patterns/ChartCard';
import type { ApiBillingUsageMetric, BillingUsageMetric, UsageMetric } from '@nangohq/types';

const NONE = 'none';

interface UsageChartCardProps {
    metric: UsageMetric;
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    selectedMonth: Date;
    /** The current global breakdown dimension ('none' or a dim). Decides when this panel's "Apply to all" shows. */
    globalBreakdown: string;
    /** Make this panel's dimension the global one and apply it to every metric that supports it. */
    onApplyToAll: (dimension: AnyBreakdownDimension) => void;
}

/** Map breakdown entries to stacked chart series: largest first, semantic colors for Status, 'rest' last. */
function toChartSeries(entries: BillingUsageMetric[], dimension: AnyBreakdownDimension): ChartSeries[] {
    const ranked = entries.filter((e) => !e.isRest).sort((a, b) => b.total - a.total);
    const series: ChartSeries[] = ranked.map((entry, i) => {
        const label = entry.group ? formatDimensionValue(dimension, entry.group.value) : '—';
        return {
            key: `s${i}`,
            color: dimension === 'success' ? (entry.group?.value === 'false' ? FAILED_SERIES_COLOR : SUCCESS_SERIES_COLOR) : colorForValue(label),
            label,
            usage: entry.usage
        };
    });
    const rest = entries.find((e) => e.isRest);
    if (rest) {
        series.push({ key: REST_SERIES_KEY, label: 'Rest', color: REST_SERIES_COLOR, usage: rest.usage });
    }
    return series;
}

/**
 * One billing usage panel. Renders the base single-series chart, and — when the
 * breakdown view is enabled — a dimension dropdown that stacks a per-dimension
 * breakdown. The headline total comes from the base metric (or a fixture override).
 */
export const UsageChartCard: React.FC<UsageChartCardProps> = ({ metric, data, isLoading, env, timeframe, selectedMonth, globalBreakdown, onApplyToAll }) => {
    const showControls = useBreakdownEnabled();

    // This panel's selected dimension (default 'none'), persisted in the URL.
    const dimensions = BREAKDOWN_DIMENSIONS[metric] as readonly AnyBreakdownDimension[];
    const [dimParam, setDimParam] = useQueryState(`${metric}.breakdown`, parseAsString.withDefault(NONE).withOptions({ history: 'replace' }));
    const dimension: AnyBreakdownDimension | null = dimensions.includes(dimParam as AnyBreakdownDimension) ? (dimParam as AnyBreakdownDimension) : null;
    const inBreakdownMode = showControls && dimension !== null;

    // Dev-only: fixtures may drive this panel from captured prod data instead of the API.
    const fixtures = useBreakdownFixtures({ enabled: showControls, metric, dimension, env, timeframe, selectedMonth, data });
    const baseData = fixtures.baseMetric ?? data;
    const usingFixtures = inBreakdownMode && fixtures.flagOn;

    const breakdownQuery = useApiGetBillingUsageBreakdown(env, timeframe, metric, dimension, DEFAULT_TOP_N, { enabled: inBreakdownMode && !fixtures.flagOn });
    const breakdownEntries = fixtures.entries ?? breakdownQuery.data?.data.usage[metric]?.breakdown;

    const breakdownSeries = useMemo<ChartSeries[] | undefined>(() => {
        if (!showControls || dimension === null) return undefined;
        return breakdownEntries ? toChartSeries(breakdownEntries, dimension) : [];
    }, [showControls, dimension, breakdownEntries]);

    // "Apply to all" shows when this panel's dimension diverges from the global one and
    // more than one metric supports it.
    const canApplyToAll = dimension !== null && dimension !== globalBreakdown && metricsSupportingDimension(dimension).length > 1;

    const headerActions = showControls ? (
        <div className="flex items-center gap-2">
            {canApplyToAll && (
                <button
                    type="button"
                    onClick={() => dimension && onApplyToAll(dimension)}
                    className="flex items-center gap-1 text-text-tertiary text-body-small-regular hover:text-text-primary"
                    title="Apply this breakdown to every metric that supports it"
                >
                    <Layers className="size-3.5" />
                    Apply to all
                </button>
            )}
            <Select value={dimension ?? NONE} onValueChange={(v) => void setDimParam(v === NONE ? null : v)}>
                <SelectTrigger size="sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                    <SelectItem value={NONE}>No breakdown</SelectItem>
                    {dimensions.map((d) => (
                        <SelectItem key={d} value={d}>
                            {DIMENSION_LABELS[d]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    ) : undefined;

    return (
        <ChartCard
            data={baseData}
            isLoading={fixtures.baseMetric ? false : isLoading}
            timeframe={timeframe}
            headerActions={headerActions}
            breakdownSeries={breakdownSeries}
            breakdownLoading={usingFixtures ? fixtures.loading : breakdownQuery.isLoading}
            breakdownError={usingFixtures ? false : breakdownQuery.isError}
            totalOverride={fixtures.total}
        />
    );
};
