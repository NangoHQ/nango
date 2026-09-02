import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatMetricPair, formatMetricUsage, formatMetricUsageExact, getUsageState, getUsageStateTextColor } from '@/utils/usage';
import { cn } from '@/utils/utils';
import { UsageBar } from './UsageBar';
import { UsageChartCard } from './UsageChartCard';

import type { UsageRowCharge } from '../usageCharges';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

export function usageRowGrid(variant: 'caps' | 'usage' | 'charges'): string {
    // Tailwind's scanner needs the full bracketed class literally in source to generate it, so this
    // picks between two complete strings rather than assembling one from a variable.
    return variant === 'caps'
        ? 'grid grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_124px_20px] items-center gap-4 px-6'
        : 'grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_124px_20px] items-center gap-4 px-6';
}

interface UsageRowProps {
    metric: UsageMetric;
    label: string;
    /** Current-period usage. For Free, the live gauge (plans/usage) against the plan cap; for paid,
     *  the billing series total (there's no cap to gauge against). */
    usage: number;
    /** Plan limit, or `null` when the plan is uncapped (every paid/legacy plan today). */
    limit: number | null;
    /** The usage figure is still loading — show a placeholder instead of a bogus 0 / —. */
    capsLoading?: boolean;
    /** Selected-month series for the drill-in chart. */
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    /** Controlled expand state — the parent persists it in the URL so it survives navigation. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** 'cumulative' for Free (progress toward the cap), 'daily' for paid. */
    chartMode: 'daily' | 'cumulative';
    variant: 'caps' | 'usage' | 'charges';
    charge?: UsageRowCharge;
}

/**
 * One metric row in the usage table: the collapsed row is the gauge (used / limit, a progress bar,
 * and % of limit / "Limit reached" — or just the usage total when uncapped), and expanding it
 * reveals the existing trend + dimension-breakdown drill-in for the month selected in the table header.
 */
export const UsageRow: React.FC<UsageRowProps> = ({
    metric,
    label,
    usage,
    limit,
    capsLoading,
    data,
    isLoading,
    env,
    timeframe,
    open,
    onOpenChange,
    chartMode,
    variant,
    charge
}) => {
    const state = getUsageState(usage, limit);
    const percent = limit ? Math.round((usage / limit) * 100) : null;
    const showLimits = variant === 'caps';
    const figures = showLimits && limit != null ? formatMetricPair(metric, usage, limit) : { usage: formatMetricUsage(metric, usage), limit: null };
    const exactFigure = formatMetricUsageExact(metric, usage) + (figures.limit != null ? ` / ${figures.limit}` : '');
    // The charge and usage queries resolve independently.
    const isPending = variant === 'charges' ? charge?.pending : capsLoading;

    return (
        <Collapsible open={open} onOpenChange={onOpenChange} className="border-b border-border-muted last:border-b-0 data-[state=open]:bg-surface-panel">
            <CollapsibleTrigger className="group w-full text-left py-4 transition-colors data-[state=closed]:hover:bg-surface-panel data-[state=open]:border-b data-[state=open]:border-border-muted">
                <div className={usageRowGrid(variant)}>
                    <div className="flex flex-col min-w-0">
                        <span className="text-text-default type-text-regular-sm truncate">{label}</span>
                    </div>
                    {variant !== 'usage' ? (
                        // Fixed track: every row's bar starts at the same x, whatever the figure's width.
                        <div className={cn('items-center gap-5', showLimits ? 'grid grid-cols-[80px_minmax(0,1fr)]' : 'flex')}>
                            {capsLoading ? (
                                <Skeleton className={cn('h-5', showLimits ? 'w-full' : 'w-32')} />
                            ) : (
                                <>
                                    <span className="text-text-default type-text-regular-sm truncate" title={exactFigure}>
                                        {figures.usage}
                                        {figures.limit != null && <span className="text-text-muted"> / {figures.limit}</span>}
                                    </span>
                                    {showLimits && limit != null && <UsageBar usage={usage} limit={limit} className="max-w-[200px]" />}
                                </>
                            )}
                        </div>
                    ) : (
                        <div />
                    )}
                    {isPending ? (
                        <Skeleton className="h-4 w-12" />
                    ) : showLimits ? (
                        <div className={cn('type-text-regular-sm', getUsageStateTextColor(state))}>
                            {limit == null ? '—' : state === 'over' ? 'Limit reached' : `${percent}%`}
                        </div>
                    ) : variant === 'usage' ? (
                        <div className="text-text-default type-text-regular-sm" title={formatMetricUsageExact(metric, usage)}>
                            {figures.usage}
                        </div>
                    ) : (
                        // On an uncapped plan a charge is what was billed, not a threshold crossed.
                        <div className="text-text-default type-text-regular-sm">{charge?.formatted ?? '—'}</div>
                    )}
                    <ChevronDown className="size-5 text-text-muted transition-transform group-data-[state=open]:rotate-180" />
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <UsageChartCard
                    metric={metric}
                    data={data}
                    isLoading={isLoading}
                    env={env}
                    timeframe={timeframe}
                    hideHeader
                    capLine={limit ?? undefined}
                    chartMode={chartMode}
                    avgPerDay
                />
            </CollapsibleContent>
        </Collapsible>
    );
};
