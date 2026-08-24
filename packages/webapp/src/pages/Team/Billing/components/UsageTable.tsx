import { Info } from 'lucide-react';

import { cn } from '@/utils/utils';
import { UsageRow, usageRowGrid } from './UsageRow';

import type { UsageChargeLookup } from '../usageCharges';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

export interface UsageTableRow {
    metric: UsageMetric;
    label: string;
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
    /** 'caps' pairs usage with the plan limit (Free); 'charges' adds the period's charge; 'usage'
     *  shows the figure alone, for a paid plan with no charge to state. */
    variant: 'caps' | 'usage' | 'charges';
    /** Resolves each row's charge. Null keeps the column empty — see `buildUsageRowCharges`. */
    charges?: UsageChargeLookup;
    /** Controlled expand state, keyed by metric — Free persists this in the URL. Uncontrolled
     *  (each row manages its own open state) when omitted. */
    isRowOpen?: (metric: UsageMetric) => boolean;
    onRowOpenChange?: (metric: UsageMetric, open: boolean) => void;
}

/**
 * The bordered per-metric usage table shared by Free and paid: a header row, then one collapsible
 * {@link UsageRow} per metric.
 */
export const UsageTable: React.FC<UsageTableProps> = ({ rows, isLoading, env, timeframe, chartMode, variant, charges, isRowOpen, onRowOpenChange }) => {
    const showLimits = variant === 'caps';
    return (
        <div className="w-full flex flex-col gap-4">
            <div className="rounded border border-border-default overflow-hidden">
                <div className={cn(usageRowGrid(variant), 'bg-surface-panel py-3 border-b border-border-default text-text-secondary type-label-xxs uppercase')}>
                    <span>Metric</span>
                    <span>{variant === 'usage' ? '' : showLimits ? 'Used / Limit' : 'This period'}</span>
                    <span>{showLimits ? '% of limit' : variant === 'usage' ? 'This period' : 'Charges'}</span>
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
                        charge={charges?.(row.metric)}
                    />
                ))}
            </div>
            <span className="flex items-center gap-1.5 text-text-muted text-body-small-regular px-1">
                <Info className="size-3.5 shrink-0" />
                Click any row to see its trend and breakdown.
            </span>
        </div>
    );
};
