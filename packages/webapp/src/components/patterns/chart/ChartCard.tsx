import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/utils/utils';
import { InfoTooltip } from '../../ui/InfoTooltip';
import { Skeleton } from '../../ui/Skeleton';
import { BreakdownChart } from './BreakdownChart';
import { formatExact, formatShare } from './chartFormat';
import { ChartLegend, ChartStaticLegend } from './ChartLegend';
import { useChartData, visibleBreakdownTotal } from './useChartData';
import { useChartInteractions } from './useChartInteractions';

import type { ChartConfig } from '../../ui/Chart';
import type { ChartSeries } from './types';
import type { ApiBillingUsageMetric } from '@nangohq/types';

interface ChartCardProps {
    isLoading: boolean;
    data?: ApiBillingUsageMetric;
    timeframe: { start: string; end: string };
    /** Right-aligned controls in the header (e.g. the breakdown dropdown). Hidden in the empty state. */
    headerActions?: React.ReactNode;
    /** Always-visible right-aligned controls (e.g. the month stepper) — kept even when empty so the user can navigate away. */
    extraHeaderActions?: React.ReactNode;
    /** When provided, the chart renders these stacked series instead of the single total. */
    breakdownSeries?: ChartSeries[];
    /** Loading/error of the per-panel detail fetch (breakdown or filtered slice), shown in the chart body. */
    detailLoading?: boolean;
    detailError?: boolean;
    /** The panel is scoped to a filtered slice — keeps the controls visible when empty and adjusts the AVG tooltip copy. */
    filtered?: boolean;
    /** The metric's unfiltered total. When set (i.e. filtered), the headline shows its share of this ("2.3% of 248,301"). */
    globalTotal?: number;
    /** Colour + label for a filtered single series (no grouping): tints the one drawn series and shows a one-row legend. */
    singleSeries?: { label: string; color: string };
    /** Fired when a series is isolated (band or legend-label click). For analytics only — keeps this pattern PostHog-free. */
    onSeriesIsolate?: () => void;
    /** Fired when a series is hidden/shown (legend swatch click). For analytics only. */
    onSeriesToggle?: () => void;
    /** Drop the label + total header (e.g. when an outer row already shows them); the controls move atop the chart body. */
    hideHeader?: boolean;
    /** Draw a horizontal cap reference line at the metric's plan limit (Free caps view). */
    capLine?: number;
    /** 'cumulative' plots counter metrics as a running month-to-date total so the curve climbs to the cap. */
    chartMode?: 'daily' | 'cumulative';
    /** In-app route for a breakdown series, when it points somewhere navigable — adds a "go to" link to its legend row. */
    seriesHref?: (series: ChartSeries) => string | undefined;
    /** The value to copy for a breakdown series, when it's worth copying — adds a copy button to its legend row. */
    seriesCopyValue?: (series: ChartSeries) => string | undefined;
    /** Fired when a series' value is copied from the legend. For analytics only. */
    onSeriesCopy?: (series: ChartSeries) => void;
    /** Fired when a series' "go to" link is followed from the legend. For analytics only. */
    onSeriesGoTo?: (series: ChartSeries) => void;
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
    extraHeaderActions,
    breakdownSeries,
    detailLoading,
    detailError,
    filtered,
    globalTotal,
    singleSeries,
    onSeriesIsolate,
    onSeriesToggle,
    hideHeader,
    capLine,
    chartMode,
    seriesHref,
    seriesCopyValue,
    onSeriesCopy,
    onSeriesGoTo
}) => {
    const isBreakdown = breakdownSeries !== undefined;
    const isCumulative = data?.view_mode === 'cumulative';
    // Counter metrics can render as a running month-to-date total (Free caps view); AVG metrics
    // (connections/records) are already a level series. renderAsArea decides area vs bars.
    const cumulativeCounter = chartMode === 'cumulative' && !isCumulative;
    const renderAsArea = isCumulative || cumulativeCounter;

    // Series labels identify the current dataset; interaction state resets when they change.
    const seriesSignature = (breakdownSeries ?? []).map((s) => s.label).join(' ');
    const baseInteractions = useChartInteractions(seriesSignature);
    // Layer the optional analytics callbacks over the interaction toggles, so the generic chart
    // components stay unaware of tracking. Rebuilt every render (baseInteractions already is).
    const interactions: typeof baseInteractions = {
        ...baseInteractions,
        toggleIsolate: (key) => {
            baseInteractions.toggleIsolate(key);
            onSeriesIsolate?.();
        },
        toggleHidden: (key) => {
            baseInteractions.toggleHidden(key);
            onSeriesToggle?.();
        }
    };
    const { todayDateKey, baseChartData, breakdownChartData, isEmpty } = useChartData(data, breakdownSeries, timeframe, cumulativeCounter);

    const chartConfig = useMemo<ChartConfig>(() => {
        if (isBreakdown) {
            return Object.fromEntries((breakdownSeries ?? []).map((s) => [s.key, { label: s.label, color: s.color }]));
        }
        return { total: { label: singleSeries?.label ?? 'Total', color: singleSeries?.color ?? 'var(--ds-color-brand-500)' } };
    }, [isBreakdown, breakdownSeries, singleSeries]);

    // What occupies the chart body: a per-panel detail spinner/error (covers both a breakdown
    // fetch and a filtered-slice fetch), the empty state, or the chart. The spinner wins while
    // the base metric loads, so the error is also gated on !isLoading — otherwise a stale detail
    // error would render alongside the base loader during a refetch.
    const showDetailSpinner = Boolean(detailLoading);
    const showDetailError = !isLoading && !detailLoading && Boolean(detailError);
    const hasBreakdownSeries =
        isBreakdown && (breakdownSeries?.length ?? 0) > 0 && (breakdownSeries?.some((s) => s.usage.some((u) => u.quantity > 0)) ?? false);
    // In breakdown mode the chart shows only the (possibly filtered) breakdown series, so
    // emptiness is about those; otherwise it's the base/filtered single series.
    const effectiveEmpty = isBreakdown ? !hasBreakdownSeries : isEmpty;

    // The headline tracks the data actually drawn: in breakdown mode the sum of the visible
    // series (so isolating/hiding a slice updates it live, no refetch, independent of the
    // response's top-level total); otherwise the single series' total. `effectiveEmpty` (not
    // `isEmpty`) so a breakdown with empty top-level `usage` still shows a number.
    const visibleKeys = (breakdownSeries ?? []).filter((s) => !interactions.isSeriesHidden(s.key)).map((s) => s.key);
    // The cap applies to the whole metric, so hide the cap line whenever the chart is scoped to a
    // slice — a filter, or an isolated/hidden breakdown series — otherwise the full cap dwarfs the
    // slice and squishes its data flat.
    const isSliced = Boolean(filtered) || (isBreakdown && visibleKeys.length < (breakdownSeries?.length ?? 0));
    let headlineTotal: number | undefined;
    if (effectiveEmpty) {
        headlineTotal = undefined;
    } else if (isBreakdown) {
        headlineTotal = visibleBreakdownTotal(breakdownChartData, visibleKeys, renderAsArea, todayDateKey);
    } else {
        headlineTotal = data?.total;
    }

    // When filtered, the headline is a slice of the metric's unfiltered total — show its share.
    const shareLabel =
        headlineTotal !== undefined && globalTotal !== undefined && globalTotal > 0
            ? `${formatShare(headlineTotal, globalTotal)} of ${formatExact(globalTotal)}`
            : null;

    // Wait for the base metric to load before drawing — otherwise the chart briefly renders
    // with the wrong type (bars before `view_mode` is known) next to the spinner.
    const showChart = !isLoading && !effectiveEmpty && !showDetailSpinner && !showDetailError && (!isBreakdown || hasBreakdownSeries);
    // Resolved (post-load) empty state: collapse the card and drop the breakdown control —
    // with no data, slicing by a dimension can't change anything.
    const showEmpty = effectiveEmpty && !isLoading && !showDetailSpinner && !showDetailError;

    return (
        <div className={cn('bg-surface-panel rounded border border-transparent flex flex-col', showEmpty ? 'h-[140px]' : 'h-[424px]')}>
            {!hideHeader && (
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
                                            {filtered &&
                                                " For a filtered slice this is the slice's contribution to the monthly average, not a standalone average."}
                                        </InfoTooltip>
                                    )}
                                </div>
                                {/* Hidden while the detail slice loads: `data` falls back to the unfiltered
                                    base then, so showing it would flash the wrong number (e.g. "100% of X"). */}
                                {headlineTotal !== undefined && !showDetailSpinner && (
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-text-secondary text-body-medium-regular">{formatExact(headlineTotal)}</span>
                                        {isCumulative && <span className="text-text-muted text-body-small-regular">monthly average</span>}
                                        {shareLabel && <span className="text-text-muted text-body-small-regular">{shareLabel}</span>}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    {(headerActions || extraHeaderActions) && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {(!showEmpty || filtered) && headerActions}
                            {extraHeaderActions}
                        </div>
                    )}
                </header>
            )}

            <main className="px-6 py-4 flex-1 min-h-0 overflow-hidden flex flex-col">
                {hideHeader && (headerActions || extraHeaderActions) && (
                    <div className="flex items-center justify-end gap-2 flex-shrink-0 pb-4">
                        {(!showEmpty || filtered) && headerActions}
                        {extraHeaderActions}
                    </div>
                )}
                {showChart && (
                    <>
                        <BreakdownChart
                            chartData={isBreakdown ? breakdownChartData : baseChartData}
                            config={chartConfig}
                            isCumulative={renderAsArea}
                            isBreakdown={isBreakdown}
                            series={breakdownSeries ?? []}
                            todayDateKey={todayDateKey}
                            interactions={interactions}
                            // Cap line only on the cumulative/point-in-time (area) view; on daily bars the
                            // monthly cap dwarfs the per-day values and would flatten the bars.
                            capLine={renderAsArea && !isSliced ? capLine : undefined}
                        />
                        {breakdownSeries && breakdownSeries.length > 0 && (
                            <ChartLegend
                                series={breakdownSeries}
                                interactions={interactions}
                                seriesHref={seriesHref}
                                seriesCopyValue={seriesCopyValue}
                                onSeriesCopy={onSeriesCopy}
                                onSeriesGoTo={onSeriesGoTo}
                            />
                        )}
                        {!isBreakdown && singleSeries && (
                            // Static, non-interactive: with one series there's nothing to isolate or hide.
                            <ChartStaticLegend series={[{ key: 'total', ...singleSeries }]} />
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
