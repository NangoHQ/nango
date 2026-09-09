import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { cn } from '@/utils/utils';
import { UsageRow, usageRowGrid } from './UsageRow';

import type { UsageChargeLookup, UsageRowCharge } from '../usageCharges';
import type { UsageRowVariant } from './UsageRow';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

export interface UsageTableRow {
    metric: UsageMetric;
    label: string;
    /** Overrides the metric-keyed lookup. Both pricings meter `connections`, so the key picks the wrong row. */
    charge?: UsageRowCharge;
    currentPlanCharge?: UsageRowCharge;
    usage: number;
    limit: number | null;
    capsLoading?: boolean;
    data?: ApiBillingUsageMetric;
}

interface UsageTableProps {
    rows: UsageTableRow[];
    isLoading: boolean;
    env: string;
    timeframe: { start: string; end: string };
    /** 'cumulative' for Free (progress toward the cap), 'daily' for paid. */
    chartMode: 'daily' | 'cumulative';
    variant: UsageRowVariant;
    charges?: UsageChargeLookup;
    /** Controlled expand state, keyed by metric — Free persists this in the URL. Uncontrolled
     *  (each row manages its own open state) when omitted. */
    isRowOpen?: (metric: UsageMetric) => boolean;
    onRowOpenChange?: (metric: UsageMetric, open: boolean) => void;
    /** Names the current plan's column. The comparison heads it with the plan the account is on. */
    currentPlanTitle?: string;
    /** The legacy meters, listed below the toggle. They keep the comparison grid so both tables line
     *  up, but no legacy meter is priced on Pay-as-you-go, so that column stays empty. */
    legacy?: boolean;
    /** Beside the current plan's column header. */
    currentPlanTooltip?: string;
    /** Beside the Pay-as-you-go column header. */
    projectedTooltip?: string;
}

/** The two right-hand column headers, which differ by variant. */
function usageColumnHeaders(variant: UsageTableProps['variant'], currentPlanTitle?: string): { thisPeriod: string; rightmost: string; extra?: string } {
    switch (variant) {
        case 'caps':
            return { thisPeriod: 'Used / Limit', rightmost: '% of limit' };
        case 'charges':
            return { thisPeriod: 'This period', rightmost: 'Charges' };
        case 'comparison':
            return { thisPeriod: 'This period', rightmost: `${currentPlanTitle ?? 'Current'} plan`, extra: 'Pay-as-you-go plan' };
        case 'usage':
            return { thisPeriod: '', rightmost: 'This period' };
    }
}

/**
 * The bordered per-metric usage table shared by Free and paid: a header row, then one collapsible
 * {@link UsageRow} per metric.
 */
export const UsageTable: React.FC<UsageTableProps> = ({
    rows,
    isLoading,
    env,
    timeframe,
    chartMode,
    variant,
    charges,
    isRowOpen,
    onRowOpenChange,
    currentPlanTitle,
    legacy,
    currentPlanTooltip,
    projectedTooltip
}) => {
    const { thisPeriod, rightmost, extra } = usageColumnHeaders(variant, currentPlanTitle);
    return (
        <div className="w-full rounded border border-border-default overflow-hidden">
            <div className={cn(usageRowGrid(variant), 'bg-surface-panel py-3 border-b border-border-default text-text-secondary type-label-xxs uppercase')}>
                <span>{legacy ? 'Legacy metric' : 'Metric'}</span>
                <span>{thisPeriod}</span>
                <span className="flex items-center gap-1.5">
                    {rightmost}
                    {currentPlanTooltip && (
                        <InfoTooltip side="top" align="start">
                            {currentPlanTooltip}
                        </InfoTooltip>
                    )}
                </span>
                {extra && (
                    <span className="flex items-center gap-1.5">
                        {!legacy && extra}
                        {!legacy && projectedTooltip && (
                            <InfoTooltip side="top" align="end">
                                {projectedTooltip}
                            </InfoTooltip>
                        )}
                    </span>
                )}
                <span />
            </div>
            {rows.map((row) => (
                <UsageRow
                    key={row.metric}
                    metric={row.metric}
                    label={row.label}
                    usage={row.usage}
                    limit={row.limit}
                    capsLoading={row.capsLoading}
                    data={row.data}
                    isLoading={isLoading}
                    env={env}
                    timeframe={timeframe}
                    open={isRowOpen?.(row.metric)}
                    onOpenChange={onRowOpenChange ? (open) => onRowOpenChange(row.metric, open) : undefined}
                    chartMode={chartMode}
                    variant={variant}
                    charge={row.charge ?? charges?.(row.metric)}
                    currentPlanCharge={row.currentPlanCharge}
                />
            ))}
        </div>
    );
};
