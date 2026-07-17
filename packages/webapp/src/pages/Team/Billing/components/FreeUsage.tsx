import { Info } from 'lucide-react';
import { useMemo } from 'react';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { useApiGetBillingUsage, useApiGetUsage } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { cn } from '@/utils/utils';
import { useSelectedMonth } from '../useSelectedMonth';
import { MonthSelector } from './MonthSelector';
import { USAGE_ROW_GRID, UsageLimitRow } from './UsageLimitRow';

import type { UsageMetric } from '@nangohq/types';

// Render order for the capped metrics. `data_transfer` is omitted — it has no Free cap.
const METRICS: UsageMetric[] = ['connections', 'proxy', 'function_compute_gbms', 'function_executions', 'function_logs', 'records', 'webhook_forwards'];

// Primary labels, kept accurate to the underlying values (not the design's shorthand, which renames
// e.g. compute to "Compute hours" without converting units).
const METRIC_LABELS: Record<UsageMetric, string> = {
    connections: 'Connections',
    proxy: 'Proxy requests',
    function_compute_gbms: 'Function compute time',
    function_executions: 'Function runs',
    function_logs: 'Function logs',
    records: 'Sync records',
    webhook_forwards: 'Webhook forwarding',
    data_transfer: 'Data transfer'
};

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
    // pointInTime: connections/records come back as the concurrent daily count (not the billing
    // running-average), so their cap line is meaningful. No-op for the counter metrics.
    const { data: usage, isLoading, error: usageError } = useApiGetBillingUsage(env, timeframe, 'clickhouse', { pointInTime: true });

    if (usageError || capsError) {
        return <CriticalErrorAlert message="Error loading usage" />;
    }

    return (
        <div className="w-full flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <span className="text-text-strong text-body-medium-medium">Usage</span>
                <MonthSelector />
            </div>
            <div className="rounded border border-border-default overflow-hidden">
                <div
                    className={cn(
                        USAGE_ROW_GRID,
                        'bg-surface-panel py-3 border-b border-border-default text-text-secondary text-body-extra-small-semi uppercase'
                    )}
                >
                    <span>Metric</span>
                    <span>Used / Limit</span>
                    <span>% of limit</span>
                    <span />
                </div>
                {METRICS.map((metric) => {
                    const cap = caps?.data[metric];
                    const used = isCurrentMonth ? (cap?.usage ?? 0) : (usage?.data.usage[metric]?.total ?? 0);
                    return (
                        <UsageLimitRow
                            key={metric}
                            metric={metric}
                            label={METRIC_LABELS[metric]}
                            usage={used}
                            limit={cap?.limit ?? null}
                            capsLoading={isCurrentMonth ? capsLoading : isLoading}
                            data={usage?.data.usage[metric]}
                            isLoading={isLoading}
                            env={env}
                            timeframe={timeframe}
                        />
                    );
                })}
            </div>
            <span className="flex items-center gap-1.5 text-text-muted text-body-small-regular px-1">
                <Info className="size-3.5 shrink-0" />
                Click any row to see its trend and breakdown.
            </span>
        </div>
    );
};
