import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatLimit, formatUsage, formatUsageExact, getUsageState, getUsageStateTextColor } from '@/utils/usage';
import { cn } from '@/utils/utils';
import { UsageBar } from './UsageBar';
import { UsageChartCard } from './UsageChartCard';

import type { UsageRowCharge } from '../usageCharges';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

/** Shared column template so the header row and each metric row line up. The last two columns are
 *  fixed at 124px/20px rather than a fraction, so the charge/percent figure can't drift from its
 *  caret on a wide viewport. The middle column's share differs by variant: Free ('caps') needs room
 *  for the used/limit bar, so metric:middle is close to even; paid has no bar, so the figure sits
 *  right beside its charge (Figma node 562-79998: metric 566px, this-period 200px, a ~3:1 split). */
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
    /** 'caps' pairs usage with the plan limit and a percentage (Free); 'charges' shows the usage
     *  figure and what it cost this period; 'usage' shows the figure alone, for a paid plan with no
     *  charge to state (a past period, or the rollout flag off). */
    variant: 'caps' | 'usage' | 'charges';
    /** This metric's charge, when the parent resolved one. Only read by the 'charges' variant. */
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
    // 'usage' keeps the figure in the last column, where it sat before charges existed.
    const usageColumn = variant === 'usage' ? 'last' : 'middle';

    return (
        <Collapsible open={open} onOpenChange={onOpenChange} className="border-b border-border-muted last:border-b-0 data-[state=open]:bg-surface-panel">
            <CollapsibleTrigger className="group w-full text-left py-4 transition-colors data-[state=closed]:hover:bg-surface-panel data-[state=open]:border-b data-[state=open]:border-border-muted">
                <div className={usageRowGrid(variant)}>
                    <div className="flex flex-col min-w-0">
                        <span className="text-text-default text-body-medium-regular truncate">{label}</span>
                    </div>
                    {usageColumn === 'middle' ? (
                        <div className="flex flex-col gap-1.5">
                            {capsLoading ? (
                                <Skeleton className="h-5 w-32" />
                            ) : (
                                <>
                                    <span className="text-text-default text-body-medium-regular" title={formatUsageExact(usage)}>
                                        {formatUsage(usage)}
                                        {showLimits && limit != null && <span className="text-text-muted"> / {formatLimit(limit)}</span>}
                                    </span>
                                    {showLimits && limit != null && <UsageBar usage={usage} limit={limit} className="max-w-[280px]" />}
                                </>
                            )}
                        </div>
                    ) : (
                        <div />
                    )}
                    {capsLoading && variant !== 'charges' ? (
                        <Skeleton className="h-4 w-12" />
                    ) : showLimits ? (
                        <div className={cn('text-body-medium-regular', getUsageStateTextColor(state))}>
                            {limit == null ? '—' : state === 'over' ? 'Limit reached' : `${percent}%`}
                        </div>
                    ) : variant === 'usage' ? (
                        <div className="text-text-default text-body-medium-regular" title={formatUsageExact(usage)}>
                            {formatUsage(usage)}
                        </div>
                    ) : charge?.pending ? (
                        <Skeleton className="h-4 w-12" />
                    ) : (
                        // No bar and no over-limit colour: on an uncapped plan a charge is what was
                        // billed, not a threshold crossed.
                        <div className="text-text-default text-body-medium-regular">{charge?.formatted ?? '—'}</div>
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
