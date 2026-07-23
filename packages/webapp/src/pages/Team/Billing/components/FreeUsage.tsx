import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { useApiGetBillingUsage, useApiGetUsage } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { getAggregateUsageState } from '@/utils/usage';
import { useSelectedMonth } from '../useSelectedMonth';
import { toggleExpandedMetric } from './expandedMetrics';
import { MonthSelector } from './MonthSelector';
import { UsageLimitBanner } from './UsageLimitBanner';
import { USAGE_METRIC_LABELS, USAGE_METRICS } from './usageMetrics';
import { UsageTable } from './UsageTable';

import type { UsageMetric } from '@nangohq/types';

/**
 * Free-plan usage view: a per-metric caps table (used / limit, % of limit, near / "Limit reached")
 * with each row collapsing open into the existing trend + dimension-breakdown drill-in. A single
 * month stepper in the table header drives the whole table (every row's used/% and the drill-in
 * charts): the live gauge for the current month, that month's usage for past months.
 */
export const FreeUsage: React.FC = () => {
    const env = useStore((state) => state.env);
    const { selectedMonth } = useSelectedMonth();

    const timeframe = useMemo(() => {
        const start = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth(), 1));
        const end = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() + 1, 1));
        return { start: start.toISOString(), end: end.toISOString() };
    }, [selectedMonth]);

    // The caps gauge (plans/usage) is live current-period. For a past month, show that month's usage
    // from the billing series instead — counters: the month total; connections/records: the point-in-time
    // value. The cap is constant, so used / limit / % stay meaningful across months.
    const now = new Date();
    const isCurrentMonth = selectedMonth.getUTCFullYear() === now.getUTCFullYear() && selectedMonth.getUTCMonth() === now.getUTCMonth();

    const { data: caps, isLoading: capsLoading, error: capsError } = useApiGetUsage(env);
    // avgPerDay: connections/records come back as the concurrent daily count (not the billing
    // running-average), so their cap line is meaningful. No-op for the counter metrics.
    const { data: usage, isLoading, error: usageError } = useApiGetBillingUsage(env, timeframe, { avgPerDay: true });

    // Persist which rows are expanded in the URL (comma-joined metric keys) so an opened drill-in
    // survives navigating into an integration and coming back.
    const [expanded, setExpanded] = useQueryState('expanded', parseAsArrayOf(parseAsString).withDefault([]).withOptions({ history: 'replace' }));
    const setRowOpen = (metric: UsageMetric, open: boolean) => {
        void setExpanded(toggleExpandedMetric(expanded, metric, open));
    };

    if (usageError || capsError) {
        return <CriticalErrorAlert message="Error loading usage" />;
    }

    const rows = USAGE_METRICS.map((metric) => {
        const cap = caps?.data[metric];
        const used = isCurrentMonth ? (cap?.usage ?? 0) : (usage?.data.usage[metric]?.total ?? 0);
        return {
            metric,
            label: USAGE_METRIC_LABELS[metric],
            usage: used,
            limit: cap?.limit ?? null,
            capsLoading: isCurrentMonth ? capsLoading : isLoading,
            data: usage?.data.usage[metric]
        };
    });

    return (
        <div className="w-full flex flex-col gap-4">
            <UsageLimitBanner state={getAggregateUsageState(caps?.data ?? {})} />
            <div className="flex justify-between items-center">
                <span className="text-text-strong text-body-medium-medium">Usage</span>
                <MonthSelector />
            </div>
            <UsageTable
                rows={rows}
                isLoading={isLoading}
                env={env}
                timeframe={timeframe}
                chartMode="cumulative"
                showLimits
                isRowOpen={(metric) => expanded.includes(metric)}
                onRowOpenChange={(metric, open) => setRowOpen(metric, open)}
            />
        </div>
    );
};
