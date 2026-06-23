import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/utils/utils';
import { InfoTooltip } from '../../ui/InfoTooltip';
import { Skeleton } from '../../ui/Skeleton';
import { BreakdownChart } from './BreakdownChart';
import { ChartLegend } from './ChartLegend';
import { useChartData, visibleBreakdownTotal } from './useChartData';
import { useChartInteractions } from './useChartInteractions';

import type { ChartConfig } from '../../ui/Chart';
import type { ChartSeries } from './types';
import type { ApiBillingUsageMetric } from '@nangohq/types';

// The headline shows the precise total (e.g. "2,172.43"); axis ticks use the shared
// compact formatter (in BreakdownChart) so big numbers don't clip.
function formatExact(quantity: number): string {
    return quantity.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

interface ChartCardProps {
    isLoading: boolean;
    data?: ApiBillingUsageMetric;
    timeframe: { start: string; end: string };
    /** Right-aligned controls in the header (e.g. the breakdown dropdown). */
    headerActions?: React.ReactNode;
    /** When provided, the chart renders these stacked series instead of the single total. */
    breakdownSeries?: ChartSeries[];
    /** Loading/error of the per-panel detail fetch (breakdown or filtered slice), shown in the chart body. */
    detailLoading?: boolean;
    detailError?: boolean;
    /** The panel is scoped to a filtered slice — keeps the controls visible when empty and adjusts the AVG tooltip copy. */
    filtered?: boolean;
    /** Colour + label for a filtered single series (no grouping): tints the one drawn series and shows a one-row legend. */
    singleSeries?: { label: string; color: string };
}

/**
 * A billing usage panel: a header (label + headline total) over a chart body that is
 * either the single-series chart, a stacked breakdown, or a loading / error / empty
 * state. The breakdown rendering and its interactions live in BreakdownChart /
 * ChartLegend; this component just decides what to show.
 */
export const ChartCard: React.FC<ChartCardProps> = ({
    isLoading,
    data,
    timeframe,
    headerActions,
    breakdownSeries,
    detailLoading,
    detailError,
    filtered,
    singleSeries
}) => {
    const isBreakdown = breakdownSeries !== undefined;
    const isCumulative = data?.view_mode === 'cumulative';

    // Series labels identify the current dataset; interaction state resets when they change.
    const seriesSignature = (breakdownSeries ?? []).map((s) => s.label).join(' ');
    const interactions = useChartInteractions(seriesSignature);
    const { todayDateKey, baseChartData, breakdownChartData, isEmpty } = useChartData(data, breakdownSeries, timeframe);

    const chartConfig = useMemo<ChartConfig>(() => {
        if (isBreakdown) {
            return Object.fromEntries((breakdownSeries ?? []).map((s) => [s.key, { label: s.label, color: s.color }]));
        }
        return { total: { label: singleSeries?.label ?? 'Total', color: singleSeries?.color ?? 'var(--ds-color-brand-500)' } };
    }, [isBreakdown, breakdownSeries, singleSeries]);

    // What occupies the chart body: a per-panel detail spinner/error (covers both a
    // breakdown fetch and a filtered-slice fetch), the empty state, or the chart.
    const showDetailSpinner = Boolean(detailLoading);
    const showDetailError = !detailLoading && Boolean(detailError);
    const hasBreakdownSeries =
        isBreakdown && (breakdownSeries?.length ?? 0) > 0 && (breakdownSeries?.some((s) => s.usage.some((u) => u.quantity > 0)) ?? false);
    // In breakdown mode the chart shows only the (possibly filtered) breakdown series, so
    // emptiness is about those; otherwise it's the base/filtered single series.
    const effectiveEmpty = isBreakdown ? !hasBreakdownSeries : isEmpty;
    // The headline tracks the data actually drawn. In breakdown mode that's the sum of the
    // visible series, so isolating/hiding a slice updates it live (no backend round-trip) and
    // it doesn't depend on the response's top-level total. Otherwise it's the single series'
    // total. `effectiveEmpty` (not `isEmpty`) so a breakdown with empty top-level `usage`
    // still shows a number.
    const visibleKeys = (breakdownSeries ?? []).filter((s) => !interactions.isSeriesHidden(s.key)).map((s) => s.key);
    const headlineTotal = isBreakdown
        ? effectiveEmpty
            ? undefined
            : visibleBreakdownTotal(breakdownChartData, visibleKeys, isCumulative, todayDateKey)
        : effectiveEmpty
          ? undefined
          : data?.total;
    // Wait for the base metric to load before drawing — otherwise the chart briefly renders
    // with the wrong type (bars before `view_mode` is known) next to the spinner.
    const showChart = !isLoading && !effectiveEmpty && !showDetailSpinner && !showDetailError && (!isBreakdown || hasBreakdownSeries);
    // Resolved (post-load) empty state: collapse the card and drop the breakdown control —
    // with no data, slicing by a dimension can't change anything.
    const showEmpty = effectiveEmpty && !isLoading && !showDetailSpinner && !showDetailError;

    return (
        <div className={cn('bg-surface-panel rounded border border-transparent flex flex-col', showEmpty ? 'h-[140px]' : 'h-[424px]')}>
            <header className="px-6 py-3 flex justify-between items-center border-b border-border-muted flex-shrink-0 gap-4">
                <div className="flex flex-col items-start justify-center h-11">
                    {isLoading || !data ? (
                        <Skeleton className="bg-surface-panel-inset h-4 w-32" />
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="text-text-strong text-body-large-semi">{data.label}</span>
                                {isCumulative && (
                                    <InfoTooltip>
                                        This metric is billed as a running monthly average, so the value shown is the average over the selected month rather
                                        than a cumulative total.
                                        {filtered && " For a filtered slice this is the slice's contribution to the monthly average, not a standalone average."}
                                    </InfoTooltip>
                                )}
                            </div>
                            {headlineTotal !== undefined && (
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-text-secondary text-body-medium-regular">{formatExact(headlineTotal)}</span>
                                    {isCumulative && <span className="text-text-muted text-body-small-regular">monthly average</span>}
                                </div>
                            )}
                        </>
                    )}
                </div>
                {headerActions && (!showEmpty || filtered) && <div className="flex items-center gap-2 flex-shrink-0">{headerActions}</div>}
            </header>

            <main className="px-6 py-4 flex-1 min-h-0 overflow-hidden flex flex-col">
                {showChart && (
                    <>
                        <BreakdownChart
                            chartData={isBreakdown ? breakdownChartData : baseChartData}
                            config={chartConfig}
                            isCumulative={isCumulative}
                            isBreakdown={isBreakdown}
                            series={breakdownSeries ?? []}
                            todayDateKey={todayDateKey}
                            interactions={interactions}
                        />
                        {breakdownSeries && breakdownSeries.length > 0 && <ChartLegend series={breakdownSeries} interactions={interactions} />}
                        {!isBreakdown && singleSeries && (
                            // Static, non-interactive: with one series there's nothing to isolate or hide.
                            <div className="flex items-center gap-1.5 pt-3 text-xs flex-shrink-0">
                                <span className="block size-2.5 rounded-[2px]" aria-hidden style={{ backgroundColor: singleSeries.color }} />
                                <span className="text-text-secondary truncate" title={singleSeries.label}>
                                    {singleSeries.label}
                                </span>
                            </div>
                        )}
                    </>
                )}

                {(isLoading || showDetailSpinner) && (
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-text-secondary text-body-medium-regular">
                            <Loader2 className="animate-spin" />
                        </span>
                    </div>
                )}

                {showDetailError && (
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-text-secondary text-body-medium-regular">Failed to load data</span>
                    </div>
                )}

                {showEmpty && (
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-text-secondary text-body-medium-regular">No data</span>
                    </div>
                )}
            </main>
        </div>
    );
};
