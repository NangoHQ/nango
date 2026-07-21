import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatLimit, formatUsage, getUsageState, getUsageStateTextColor } from '@/utils/usage';
import { cn } from '@/utils/utils';
import { UsageBar } from './UsageBar';
import { UsageChartCard } from './UsageChartCard';

import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

/** Shared column template so the header row and each metric row line up. */
export const USAGE_ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_minmax(0,1fr)_20px] items-center gap-4 px-6';

interface UsageLimitRowProps {
    metric: UsageMetric;
    label: string;
    /** Live current-period usage (from the plans/usage endpoint), against the plan cap. */
    usage: number;
    limit: number | null;
    /** The caps gauge (usage/limit) is still loading — show a placeholder instead of a bogus 0 / —. */
    capsLoading?: boolean;
    /** Selected-month series for the drill-in chart. */
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    /** Controlled expand state — the parent persists it in the URL so it survives navigation. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

/**
 * One metric row in the Free-plan caps table: the collapsed row is the gauge (used / limit, a
 * progress bar, and % of limit / "Limit reached"), and expanding it reveals the existing trend +
 * dimension-breakdown drill-in for the month selected in the table header.
 */
export const UsageLimitRow: React.FC<UsageLimitRowProps> = ({
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
    onOpenChange
}) => {
    const state = getUsageState(usage, limit);
    const percent = limit ? Math.round((usage / limit) * 100) : null;

    return (
        <Collapsible open={open} onOpenChange={onOpenChange} className="border-b border-border-muted last:border-b-0 data-[state=open]:bg-surface-panel">
            <CollapsibleTrigger className="group w-full text-left py-4 transition-colors data-[state=closed]:hover:bg-surface-panel">
                <div className={USAGE_ROW_GRID}>
                    <div className="flex flex-col min-w-0">
                        <span className="text-text-default text-body-medium-regular truncate">{label}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {capsLoading ? (
                            <Skeleton className="h-5 w-32" />
                        ) : (
                            <>
                                <span className="text-text-default text-body-medium-regular">
                                    {formatUsage(usage)}
                                    {limit != null && <span className="text-text-muted"> / {formatLimit(limit)}</span>}
                                </span>
                                {limit != null && <UsageBar usage={usage} limit={limit} className="max-w-[280px]" />}
                            </>
                        )}
                    </div>
                    {capsLoading ? (
                        <Skeleton className="h-4 w-12" />
                    ) : (
                        <div className={cn('text-body-medium-regular', getUsageStateTextColor(state))}>
                            {limit == null ? '—' : state === 'over' ? 'Limit reached' : `${percent}%`}
                        </div>
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
                    disableApplyToAll
                    capLine={limit ?? undefined}
                    chartMode="cumulative"
                    avgPerDay
                />
            </CollapsibleContent>
        </Collapsible>
    );
};
