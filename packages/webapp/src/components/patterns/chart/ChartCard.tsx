import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';

import { BreakdownChart } from './BreakdownChart';
import { ChartLegend } from './ChartLegend';
import { useChartData } from './useChartData';
import { useChartInteractions } from './useChartInteractions';
import { InfoTooltip } from '../../ui/InfoTooltip';
import { Skeleton } from '../../ui/Skeleton';
import { cn } from '@/utils/utils';

import type { ChartSeries } from './types';
import type { ChartConfig } from '../../ui/Chart';
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
    breakdownLoading?: boolean;
    breakdownError?: boolean;
}

/**
 * A billing usage panel: a header (label + headline total) over a chart body that is
 * either the single-series chart, a stacked breakdown, or a loading / error / empty
 * state. The breakdown rendering and its interactions live in BreakdownChart /
 * ChartLegend; this component just decides what to show.
 */
export const ChartCard: React.FC<ChartCardProps> = ({ isLoading, data, timeframe, headerActions, breakdownSeries, breakdownLoading, breakdownError }) => {
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
        return { total: { label: 'Total', color: 'var(--color-brand-500)' } };
    }, [isBreakdown, breakdownSeries]);

    // What occupies the chart body: a breakdown spinner/error, the empty state, or the chart.
    const showBreakdownSpinner = isBreakdown && breakdownLoading;
    const showBreakdownError = isBreakdown && !breakdownLoading && breakdownError;
    const hasBreakdownSeries =
        isBreakdown && (breakdownSeries?.length ?? 0) > 0 && (breakdownSeries?.some((s) => s.usage.some((u) => u.quantity > 0)) ?? false);
    const effectiveEmpty = isEmpty && !hasBreakdownSeries;
    const headlineTotal = isEmpty ? undefined : data?.total;
    // Wait for the base metric to load before drawing — otherwise the chart briefly renders
    // with the wrong type (bars before `view_mode` is known) next to the spinner.
    const showChart = !isLoading && !effectiveEmpty && !showBreakdownSpinner && !showBreakdownError && (!isBreakdown || hasBreakdownSeries);
    // Resolved (post-load) empty state: collapse the card and drop the breakdown control —
    // with no data, slicing by a dimension can't change anything.
    const showEmpty = effectiveEmpty && !isLoading && !showBreakdownSpinner && !showBreakdownError;

    return (
        <div className={cn('bg-surface-page rounded border border-transparent flex flex-col', showEmpty ? 'h-[140px]' : 'h-[424px]')}>
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
                {headerActions && !showEmpty && <div className="flex items-center gap-2 flex-shrink-0">{headerActions}</div>}
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
                    </>
                )}

                {(isLoading || showBreakdownSpinner) && (
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-text-secondary text-body-medium-regular">
                            <Loader2 className="animate-spin" />
                        </span>
                    </div>
                )}

                {showBreakdownError && (
                    <div className="flex flex-col items-center justify-center flex-1">
                        <span className="text-text-secondary text-body-medium-regular">Failed to load breakdown</span>
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
