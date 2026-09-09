import { Fragment } from 'react';

import { Badge } from '@nangohq/design-system';

import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { cn } from '@/utils/utils';
import { formatMoneyFromCents } from '../money';
import { UsageRow, usageRowGrid } from './UsageRow';

import type { UsageChargeLookup, UsageRowCharge } from '../usageCharges';
import type { UsageRowVariant } from './UsageRow';
import type { BadgeProps } from '@nangohq/design-system';
import type { ApiBillingUsageMetric, UsageMetric } from '@nangohq/types';

export interface UsageTableRow {
    metric: UsageMetric;
    label: string;
    group?: string;
    /** Overrides the metric-keyed lookup. Both pricings meter `connections`, so the key picks the wrong row. */
    charge?: UsageRowCharge;
    currentPlanCharge?: UsageRowCharge;
    usage: number;
    limit: number | null;
    capsLoading?: boolean;
    data?: ApiBillingUsageMetric;
}

export interface UsageTableTotals {
    subtotalInCents: number;
    minimumInCents: number;
    minimumApplied: boolean;
    growthAddOnInCents: number;
    totalInCents: number;
    currency: string;
    currentPlanTitle?: string;
    currentPlan?: { usageInCents: number; fixedInCents: number; totalInCents: number } | null;
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
    totals?: UsageTableTotals;
    extraColumnTooltip?: string;
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
    totals,
    extraColumnTooltip
}) => {
    const { thisPeriod, rightmost, extra } = usageColumnHeaders(variant, totals?.currentPlanTitle);
    return (
        <div className="w-full rounded border border-border-default overflow-hidden">
            <div className={cn(usageRowGrid(variant), 'bg-surface-panel py-3 border-b border-border-default text-text-secondary type-label-xxs uppercase')}>
                <span>Metric</span>
                <span>{thisPeriod}</span>
                <span>{rightmost}</span>
                {extra && (
                    <span className="flex items-center gap-1.5">
                        {extra}
                        {extraColumnTooltip && (
                            <InfoTooltip side="top" align="end">
                                {extraColumnTooltip}
                            </InfoTooltip>
                        )}
                    </span>
                )}
                <span />
            </div>
            {rows.map((row, index) => (
                <Fragment key={row.group ? `${row.group}:${row.metric}` : row.metric}>
                    {row.group && row.group !== rows[index - 1]?.group && (
                        <div
                            className={cn(
                                usageRowGrid(variant),
                                'py-2 bg-surface-panel-inset border-b border-border-muted text-text-secondary type-label-xxs uppercase'
                            )}
                        >
                            <span>{row.group}</span>
                        </div>
                    )}
                    <UsageRow
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
                </Fragment>
            ))}
            {totals && <UsageTotals variant={variant} totals={totals} />}
        </div>
    );
};

const TotalsLine: React.FC<{
    variant: UsageTableProps['variant'];
    label: string;
    amount: string | null;
    currentPlanAmount?: string | null;
    tooltip?: string;
    strong?: boolean;
}> = ({ variant, label, amount, currentPlanAmount, tooltip, strong }) => {
    const text = cn('tabular-nums', strong ? 'text-text-strong text-body-medium-medium' : 'text-text-default type-text-regular-sm');
    return (
        <div className={cn(usageRowGrid(variant), 'py-2.5')}>
            <span className={cn('truncate', strong ? 'text-text-strong text-body-medium-medium' : 'text-text-secondary type-text-regular-sm')}>{label}</span>
            <span />
            {variant === 'comparison' && <span className={text}>{currentPlanAmount ?? ''}</span>}
            <span className="flex items-center gap-1.5">
                <span className={text}>{amount ?? '—'}</span>
                {tooltip && <InfoTooltip side="top">{tooltip}</InfoTooltip>}
            </span>
            <span />
        </div>
    );
};

function minimumNote(totals: UsageTableTotals, money: (cents: number) => string | null): string {
    const minimum = money(totals.minimumInCents);
    return minimum ? `Accrued usage is below the ${minimum} monthly minimum.` : 'Accrued usage is below the monthly minimum.';
}

function billDifference(totals: UsageTableTotals): { text: string; variant: BadgeProps['variant'] } | null {
    if (!totals.currentPlan) {
        return null;
    }
    const delta = totals.totalInCents - totals.currentPlan.totalInCents;
    if (delta === 0) {
        return null;
    }
    const formatted = formatMoneyFromCents(Math.abs(delta), totals.currency) ?? '';
    return delta > 0 ? { text: `+${formatted}`, variant: 'warning' } : { text: `−${formatted}`, variant: 'success' };
}

const UsageTotals: React.FC<{ variant: UsageTableProps['variant']; totals: UsageTableTotals }> = ({ variant, totals }) => {
    const money = (cents: number) => formatMoneyFromCents(cents, totals.currency);
    const comparing = variant === 'comparison';
    const difference = comparing ? billDifference(totals) : null;

    return (
        <div className="bg-surface-input-muted">
            {/* The floor replaces the subtotal rather than adding to it, so it goes on this line. */}
            <TotalsLine
                variant={variant}
                label="Usage charges"
                amount={money(totals.minimumApplied ? totals.minimumInCents : totals.subtotalInCents)}
                currentPlanAmount={totals.currentPlan ? money(totals.currentPlan.usageInCents) : null}
                {...(comparing && totals.minimumApplied ? { tooltip: minimumNote(totals, money) } : {})}
            />
            {(totals.growthAddOnInCents > 0 || (totals.currentPlan?.fixedInCents ?? 0) > 0) && (
                <TotalsLine
                    variant={variant}
                    label="Fixed charges"
                    amount={money(totals.growthAddOnInCents)}
                    currentPlanAmount={totals.currentPlan ? money(totals.currentPlan.fixedInCents) : null}
                />
            )}
            {comparing ? (
                <div className={cn(usageRowGrid(variant), 'py-3')}>
                    <span className="text-text-strong text-body-medium-medium truncate">Total</span>
                    <span />
                    <span className="tabular-nums text-text-default text-body-medium-medium">
                        {totals.currentPlan ? (money(totals.currentPlan.totalInCents) ?? '—') : ''}
                    </span>
                    <span className="flex items-baseline gap-2">
                        <span className="tabular-nums text-text-strong text-body-medium-medium">{money(totals.totalInCents) ?? '—'}</span>
                        {difference && (
                            // The token stylesheet is imported unlayered, so the Badge's own
                            // `type-code-regular-xs` wins without the `!`.
                            // eslint-disable-next-line react/forbid-component-props -- deliberate: this comparison view is short-lived, so the weight is not worth a design-system variant
                            <Badge variant={difference.variant} className="text-body-medium-medium!">
                                {difference.text}
                            </Badge>
                        )}
                    </span>
                    <span />
                </div>
            ) : (
                <TotalsLine variant={variant} label="Projected total" amount={money(totals.totalInCents)} strong />
            )}
        </div>
    );
};
