import { Layers } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import {
    BREAKDOWN_DIMENSIONS,
    DEFAULT_TOP_N,
    DIMENSION_LABELS,
    HIDDEN_BREAKDOWN_DIMENSIONS,
    USAGE_BREAKDOWN_AVAILABLE_FROM_LABEL,
    formatDimensionValue,
    isBreakdownAvailableForMonth,
    metricsSupportingDimension
} from '../usageBreakdown';
import { buildFixtureBreakdownEntries, getCapturedFixtureEntries, useFixtureDimensionValues } from '../usageBreakdownFixtures';
import { ChartCard } from '@/components-v2/patterns/ChartCard';
import { FAILED_SERIES_COLOR, REST_SERIES_COLOR, REST_SERIES_KEY, SUCCESS_SERIES_COLOR, seriesColorAt } from '@/components-v2/patterns/usageChartColors';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/Select';
import { useApiGetBillingUsageBreakdown } from '@/hooks/usePlan';
import { useFeatureFlagsStore } from '@/store/feature-flags';

import type { AnyBreakdownDimension } from '../usageBreakdown';
import type { ChartSeries } from '@/components-v2/patterns/ChartCard';
import type { ApiBillingUsageMetric, BillingUsageMetric, UsageMetric } from '@nangohq/types';

const NONE = 'none';

interface UsageChartCardProps {
    metric: UsageMetric;
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    selectedMonth: Date;
    /** The current global breakdown dimension ('none' or a dim). Used to decide when this panel's "Apply to all" shows. */
    globalBreakdown: string;
    /** Make this panel's dimension the global one and apply it to every metric that supports it. */
    onApplyToAll: (dimension: AnyBreakdownDimension) => void;
}

/**
 * Billing usage panel: renders the base single-series chart by default, and —
 * when the `usageBreakdown` dev flag is on and the selected month is breakdown-
 * eligible — adds a per-panel Breakdown control that fetches and stacks a
 * dimensional breakdown. The headline total always comes from the base metric.
 */
export const UsageChartCard: React.FC<UsageChartCardProps> = ({ metric, data, isLoading, env, timeframe, selectedMonth, globalBreakdown, onApplyToAll }) => {
    const breakdownFlag = useFeatureFlagsStore((s) => s.usageBreakdown);
    const fixturesFlag = useFeatureFlagsStore((s) => s.usageBreakdownFixtures);
    const monthAvailable = isBreakdownAvailableForMonth(selectedMonth);
    const showControls = breakdownFlag && monthAvailable;

    const dimensions: readonly AnyBreakdownDimension[] = (BREAKDOWN_DIMENSIONS[metric] as readonly AnyBreakdownDimension[]).filter(
        (d) => !HIDDEN_BREAKDOWN_DIMENSIONS.includes(d)
    );

    // Each panel owns its breakdown explicitly (default 'none'). No inheritance —
    // the dropdown always shows the panel's real selection.
    const [dimParam, setDimParam] = useQueryState(`${metric}.breakdown`, parseAsString.withDefault(NONE).withOptions({ history: 'replace' }));
    const dimension: AnyBreakdownDimension | null = dimensions.includes(dimParam as AnyBreakdownDimension) ? (dimParam as AnyBreakdownDimension) : null;

    const inBreakdownMode = showControls && dimension !== null;

    // "Apply to all" shows when this panel's selection diverges from the global one
    // and is worth propagating (a dimension more than one metric supports).
    const canApplyToAll = dimension !== null && dimension !== globalBreakdown && metricsSupportingDimension(dimension).length > 1;
    const fixturesOn = inBreakdownMode && fixturesFlag;

    // Real breakdown — disabled when fixtures drive the panel.
    // Top-N is fixed at the default; the long tail collapses into the 'rest' bucket.
    const breakdownQuery = useApiGetBillingUsageBreakdown(env, timeframe, metric, dimension, DEFAULT_TOP_N, { enabled: inBreakdownMode && !fixturesFlag });

    // Fixtures: prefer real prod data captured for this month; fall back to a
    // synthesized distribution (real env names) for months we didn't capture.
    const capturedEntries = useMemo(
        () => (fixturesOn && dimension !== null ? getCapturedFixtureEntries(selectedMonth, metric, dimension) : undefined),
        [fixturesOn, dimension, metric, selectedMonth]
    );
    const needSynth = fixturesOn && dimension !== null && !capturedEntries;
    const { values: fixtureValues, isLoading: fixtureValuesLoading } = useFixtureDimensionValues(env, dimension, needSynth);
    const synthEntries = useMemo<BillingUsageMetric[] | undefined>(() => {
        if (!needSynth || dimension === null) return undefined;
        return buildFixtureBreakdownEntries({
            metric,
            dimension,
            values: fixtureValues,
            timeframe,
            top: DEFAULT_TOP_N,
            viewMode: data?.view_mode === 'cumulative' ? 'cumulative' : 'periodic'
        });
    }, [needSynth, dimension, metric, fixtureValues, timeframe, data?.view_mode]);

    const fixtureEntries = capturedEntries ?? synthEntries;
    const breakdownEntries = fixtureEntries ?? breakdownQuery.data?.data.usage[metric]?.breakdown;

    // Fixtures invent a large total; show that (not the real base total) in the header.
    const totalOverride = fixtureEntries ? fixtureEntries.reduce((sum, e) => sum + e.total, 0) : undefined;

    const breakdownSeries = useMemo<ChartSeries[] | undefined>(() => {
        if (!showControls || dimension === null) return undefined;
        if (!breakdownEntries) return [];

        const series: ChartSeries[] = [];
        let colorIndex = 0;
        for (const entry of breakdownEntries) {
            if (entry.isRest) continue; // 'rest' always rendered last
            // Status (success) gets semantic red/green; every other dimension uses the categorical palette.
            const color = dimension === 'success' ? (entry.group?.value === 'false' ? FAILED_SERIES_COLOR : SUCCESS_SERIES_COLOR) : seriesColorAt(colorIndex);
            series.push({
                key: `s${colorIndex}`,
                label: entry.group ? formatDimensionValue(dimension, entry.group.value) : '—',
                color,
                usage: entry.usage
            });
            colorIndex++;
        }
        const rest = breakdownEntries.find((e) => e.isRest);
        if (rest) {
            series.push({ key: REST_SERIES_KEY, label: 'Rest', color: REST_SERIES_COLOR, usage: rest.usage });
        }
        return series;
    }, [showControls, dimension, breakdownEntries]);

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

    // Flag on but the selected month predates the breakdown cutover: explain the absence of controls.
    const notice = breakdownFlag && !monthAvailable ? `Detailed breakdowns are available from ${USAGE_BREAKDOWN_AVAILABLE_FROM_LABEL}.` : undefined;

    return (
        <ChartCard
            data={data}
            isLoading={isLoading}
            timeframe={timeframe}
            headerActions={headerActions}
            notice={notice}
            breakdownSeries={breakdownSeries}
            breakdownLoading={fixturesOn ? fixtureValuesLoading : breakdownQuery.isLoading}
            breakdownError={fixturesOn ? false : breakdownQuery.isError}
            totalOverride={totalOverride}
        />
    );
};
