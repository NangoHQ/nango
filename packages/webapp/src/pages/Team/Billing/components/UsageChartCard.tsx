import { Layers } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';

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
import { buildFixtureBreakdownEntries, useFixtureDimensionValues } from '../usageBreakdownFixtures';
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
    /** Apply a dimension to every metric that supports it from a dropdown option's inline "All" action (null clears every panel). */
    onApplyToAll: (dimension: AnyBreakdownDimension | null) => void;
}

/**
 * Billing usage panel: renders the base single-series chart by default, and —
 * when the `usageBreakdown` dev flag is on and the selected month is breakdown-
 * eligible — adds a per-panel Breakdown control that fetches and stacks a
 * dimensional breakdown. The headline total always comes from the base metric.
 */
export const UsageChartCard: React.FC<UsageChartCardProps> = ({ metric, data, isLoading, env, timeframe, selectedMonth, onApplyToAll }) => {
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

    // Controlled so the "Apply to all" inline action can close the menu (it doesn't select an item).
    const [open, setOpen] = useState(false);

    const inBreakdownMode = showControls && dimension !== null;
    const fixturesOn = inBreakdownMode && fixturesFlag;

    // Real breakdown — disabled when fixtures drive the panel.
    // Top-N is fixed at the default; the long tail collapses into the 'rest' bucket.
    const breakdownQuery = useApiGetBillingUsageBreakdown(env, timeframe, metric, dimension, DEFAULT_TOP_N, { enabled: inBreakdownMode && !fixturesFlag });

    // Fixtures: real dimension names from the env + a synthesized distribution.
    const { values: fixtureValues, isLoading: fixtureValuesLoading } = useFixtureDimensionValues(env, dimension, fixturesOn);
    const fixtureEntries = useMemo<BillingUsageMetric[] | undefined>(() => {
        if (!fixturesOn || dimension === null) return undefined;
        return buildFixtureBreakdownEntries({
            metric,
            dimension,
            values: fixtureValues,
            timeframe,
            top: DEFAULT_TOP_N,
            viewMode: data?.view_mode === 'cumulative' ? 'cumulative' : 'periodic',
            total: data?.total
        });
    }, [fixturesOn, dimension, metric, fixtureValues, timeframe, data?.view_mode, data?.total]);

    const breakdownEntries = fixtureEntries ?? breakdownQuery.data?.data.usage[metric]?.breakdown;

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

    // Clicking an option sets just this panel; clicking its inline "All" action fans
    // the dimension out to every metric that supports it (or clears every panel on
    // "No breakdown"). Shown only where it does something — dimensions more than one
    // metric supports, plus "No breakdown".
    const applyAllAction = (dim: AnyBreakdownDimension | null) => (
        <button
            type="button"
            className="flex cursor-default items-center gap-1 text-text-tertiary text-body-small-regular hover:text-text-primary"
            onClick={() => {
                onApplyToAll(dim);
                setOpen(false);
            }}
        >
            <Layers className="size-3 text-current" />
            All
        </button>
    );

    const headerActions = showControls ? (
        <Select open={open} onOpenChange={setOpen} value={dimension ?? NONE} onValueChange={(v) => void setDimParam(v === NONE ? null : v)}>
            <SelectTrigger size="sm">
                <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
                <SelectItem value={NONE} action={applyAllAction(null)}>
                    No breakdown
                </SelectItem>
                {dimensions.map((d) => (
                    <SelectItem key={d} value={d} action={metricsSupportingDimension(d).length > 1 ? applyAllAction(d) : undefined}>
                        {DIMENSION_LABELS[d]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
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
        />
    );
};
