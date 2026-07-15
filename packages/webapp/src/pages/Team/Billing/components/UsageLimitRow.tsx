import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { formatLimit, formatUsage, getUsageState } from '@/utils/usage';
import { cn } from '@/utils/utils';
import { MonthPagination } from './MonthPagination';
import { UsageBar } from './UsageBar';
import { UsageChartCard } from './UsageChartCard';

import type { GroupFilterSelection } from '../useGlobalGroupFilter';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

/** Shared column template so the header row and each metric row line up. */
export const USAGE_ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_minmax(0,1fr)_20px] items-center gap-4 px-6';

interface UsageLimitRowProps {
    metric: UsageMetric;
    label: string;
    sublabel?: string;
    /** Live current-period usage (from the plans/usage endpoint), against the plan cap. */
    usage: number;
    limit: number | null;
    /** Selected-month series for the drill-in chart. */
    data?: ApiBillingUsageMetric;
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    isDivergingFromGlobal: (metric: UsageMetric, selection: GroupFilterSelection) => boolean;
    onApplyToAll: (selection: GroupFilterSelection) => void;
}

/**
 * One metric row in the Free-plan caps table: the collapsed row is the gauge (used / limit, a
 * progress bar, and % of limit / "Limit reached"), and expanding it reveals the existing trend +
 * dimension-breakdown drill-in with a month stepper in its header.
 */
export const UsageLimitRow: React.FC<UsageLimitRowProps> = ({
    metric,
    label,
    sublabel,
    usage,
    limit,
    data,
    isLoading,
    env,
    timeframe,
    isDivergingFromGlobal,
    onApplyToAll
}) => {
    const state = getUsageState(usage, limit);
    const percent = limit ? Math.round((usage / limit) * 100) : null;

    return (
        <Collapsible className="border-b border-border-muted last:border-b-0 data-[state=open]:bg-surface-panel">
            <CollapsibleTrigger className="group w-full text-left py-4 transition-colors data-[state=closed]:hover:bg-surface-panel">
                <div className={USAGE_ROW_GRID}>
                    <div className="flex flex-col min-w-0">
                        <span className="text-text-default text-body-medium-regular truncate">{label}</span>
                        {sublabel && <span className="text-text-secondary text-body-small-regular truncate">{sublabel}</span>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-text-default text-body-medium-regular">
                            {formatUsage(usage)}
                            {limit != null && <span className="text-text-muted"> / {formatLimit(limit)}</span>}
                        </span>
                        {limit != null && <UsageBar usage={usage} limit={limit} className="max-w-[280px]" />}
                    </div>
                    <div
                        className={cn(
                            'text-body-medium-regular',
                            limit == null ? 'text-text-muted' : state === 'over' ? 'text-text-danger' : 'text-text-default'
                        )}
                    >
                        {limit == null ? '—' : state === 'over' ? 'Limit reached' : `${percent}%`}
                    </div>
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
                    isDivergingFromGlobal={isDivergingFromGlobal}
                    onApplyToAll={onApplyToAll}
                    hideHeader
                    disableApplyToAll
                    extraHeaderActions={<MonthPagination />}
                />
            </CollapsibleContent>
        </Collapsible>
    );
};
