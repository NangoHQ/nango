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
    /** Heading this row sits under. Rows sharing one are grouped in order. */
    group?: string;
    /** Overrides the table's `charges` lookup — needed once one table holds two pricing models,
     *  since `connections` appears in both and a metric-keyed lookup cannot tell them apart. */
    charge?: UsageRowCharge;
    currentPlanCharge?: UsageRowCharge;
    usage: number;
    limit: number | null;
    capsLoading?: boolean;
    data?: ApiBillingUsageMetric;
}

/** What the rows add up to, when the table is showing a bill rather than bare usage. */
export interface UsageTableTotals {
    subtotalInCents: number;
    minimumInCents: number;
    minimumApplied: boolean;
    growthAddOnInCents: number;
    totalInCents: number;
    currency: string;
    /** The current plan's name and its own charges for the same window, for the comparison. Null
     *  when Orb can't state them — a plan without per-period spend, or an unlinked subscription. */
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
    /** Footer lines under the rows. Omitted when the table isn't stating a bill. */
    totals?: UsageTableTotals;
    /** Caveat for the rightmost comparison column, shown on an info icon beside its header. */
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

/** One footer line: label on the left, amounts in the same columns the per-metric charges sit in. */
const TotalsLine: React.FC<{
    variant: UsageTableProps['variant'];
    label: string;
    amount: string | null;
    currentPlanAmount?: string | null;
    /** Caveat on the Pay-as-you-go figure, shown on an info icon beside it. */
    tooltip?: string;
    strong?: boolean;
}> = ({ variant, label, amount, currentPlanAmount, tooltip, strong }) => {
    // Sized like a metric row: these lines continue the column rather than annotate it.
    const text = cn('tabular-nums', strong ? 'text-text-strong text-body-medium-medium' : 'text-text-default type-text-regular-sm');
    return (
        <div className={cn(usageRowGrid(variant), 'py-2.5')}>
            <span className={cn('truncate', strong ? 'text-text-strong text-body-medium-medium' : 'text-text-secondary type-text-regular-sm')}>{label}</span>
            <span />
            {/* Blank rather than a dash: the current plan simply has no figure of this kind. */}
            {variant === 'comparison' && <span className={text}>{currentPlanAmount ?? ''}</span>}
            <span className="flex items-center gap-1.5">
                <span className={text}>{amount ?? '—'}</span>
                {tooltip && <InfoTooltip side="top">{tooltip}</InfoTooltip>}
            </span>
            <span />
        </div>
    );
};

/** Why the usage line reads higher than the metrics above it add up to. */
function minimumNote(totals: UsageTableTotals, money: (cents: number) => string | null): string {
    const minimum = money(totals.minimumInCents);
    return minimum ? `Accrued usage is below the ${minimum} monthly minimum.` : 'Accrued usage is below the monthly minimum.';
}

/** The difference between the two bills, as a badge variant. Null when there is nothing to compare. */
function billDifference(totals: UsageTableTotals): { text: string; variant: BadgeProps['variant'] } | null {
    if (!totals.currentPlan) {
        return null;
    }
    const delta = totals.totalInCents - totals.currentPlan.totalInCents;
    // Two identical totals say it themselves; a badge would only add noise.
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

    // Both columns split the same way — what usage cost, then what is charged regardless of it —
    // so the two bills are read the same way and each column's lines add up to its own total.
    // One shared background across the block, so the summed lines read as one unit rather than
    // leaving the total looking like another metric row.
    // No top border of its own: the last metric row already draws one, and the shared background is
    // what actually marks the block off.
    return (
        <div className="bg-surface-input-muted">
            {/* Under the minimum, the floor *is* the usage charge — it replaces the subtotal rather
                than adding to it, so it goes on this line with the arithmetic explained on hover. */}
            <TotalsLine
                variant={variant}
                label={comparing ? 'Usage charges' : 'Subtotal'}
                amount={money(totals.minimumApplied ? totals.minimumInCents : totals.subtotalInCents)}
                currentPlanAmount={totals.currentPlan ? money(totals.currentPlan.usageInCents) : null}
                {...(comparing && totals.minimumApplied ? { tooltip: minimumNote(totals, money) } : {})}
            />
            {(totals.growthAddOnInCents > 0 || (totals.currentPlan?.fixedInCents ?? 0) > 0) && (
                <TotalsLine
                    variant={variant}
                    label={comparing ? 'Fixed charges' : 'Growth add-on'}
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
                    {/* The difference is the answer the page exists to give, so it carries the same
                        weight as the total it comes from rather than trailing it as a footnote. */}
                    <span className="flex items-baseline gap-2">
                        <span className="tabular-nums text-text-strong text-body-medium-medium">{money(totals.totalInCents) ?? '—'}</span>
                        {difference && (
                            // Matches the total beside it in size and weight, which the Badge's own
                            // `type-code-regular-xs` otherwise wins — the token stylesheet is
                            // imported unlayered, so it outranks the utility without `!`.
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
