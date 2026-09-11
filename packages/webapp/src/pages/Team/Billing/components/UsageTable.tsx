import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { cn } from '@/utils/utils';
import { UsageRow, usageRowGrid } from './UsageRow';

import type { UsageChargeLookup, UsageRowCharge } from '../usageCharges';
import type { UsageRowVariant } from './UsageRow';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

export interface UsageTableRow {
    metric: UsageMetric;
    label: string;
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
    currentPlanTitle?: string;
    legacy?: boolean;
    /** Overrides the rightmost column's header, which otherwise names the current plan. */
    rightmostHeader?: string;
    rightmostTooltip?: string;
    extraTooltip?: string;
}

/** The two right-hand column headers, which differ by variant. */
function usageColumnHeaders(
    variant: UsageTableProps['variant'],
    currentPlanTitle?: string,
    rightmostHeader?: string
): { thisPeriod: string; rightmost: string; extra?: string } {
    switch (variant) {
        case 'caps':
            return { thisPeriod: 'Used / Limit', rightmost: '% of limit' };
        case 'charges':
            return { thisPeriod: 'This period', rightmost: rightmostHeader ?? 'Charges' };
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
    rightmostHeader,
    rightmostTooltip,
    extraTooltip
}) => {
    const { thisPeriod, rightmost, extra } = usageColumnHeaders(variant, currentPlanTitle, rightmostHeader);
    return (
        <div className="w-full rounded border border-border-default overflow-hidden">
            <div className={cn(usageRowGrid(variant), 'bg-surface-panel py-3 border-b border-border-default text-text-secondary type-label-xxs uppercase')}>
                <span>{legacy ? 'Legacy metric' : 'Metric'}</span>
                <span>{thisPeriod}</span>
                <span className="flex items-center gap-1.5">
                    {rightmost}
                    {rightmostTooltip && (
                        <InfoTooltip side="top" align="start">
                            {rightmostTooltip}
                        </InfoTooltip>
                    )}
                </span>
                {extra && (
                    <span className="flex items-center gap-1.5">
                        {!legacy && extra}
                        {!legacy && extraTooltip && (
                            <InfoTooltip side="top" align="end">
                                {extraTooltip}
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
