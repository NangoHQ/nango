import { Card } from '@nangohq/design-system';

import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/utils';

export interface SummaryStripProps {
    /** Null renders a skeleton — the plan decides which other slots appear, so nothing else can resolve first. */
    headline: { label: string; value: string | null; tooltip?: string } | null;
    plan?: { value: string } | null;
    date?: { label: string; value: string } | null;
    /** Omitted whenever there's no card to show — Free, no card on file, or no billing permission. */
    payment?: { card: { brand?: string | null; last4: string }; action?: React.ReactNode } | null;
    /** Footer sentence for a scheduled plan change. */
    change?: { toPlanTitle: string; at: string; detail: string | null } | null;
}

const SummaryLabel: React.FC<{ label: string; tooltip?: string }> = ({ label, tooltip }) => (
    <div className="flex items-center gap-1.5">
        <span className="type-text-regular-xs text-text-disabled">{label}</span>
        {tooltip && (
            <InfoTooltip side="top" align="start">
                {tooltip}
            </InfoTooltip>
        )}
    </div>
);

const SummaryItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-col gap-1">
        <SummaryLabel label={label} />
        <div className="flex items-center gap-1.5 h-5 type-text-regular-sm text-text-default">{children}</div>
    </div>
);

/**
 * Presentational billing summary strip. Pure — every decision about which slots appear, and what
 * the headline says, is made by `buildSummaryState`.
 */
export const SummaryStrip: React.FC<SummaryStripProps> = ({ headline, plan, date, payment, change }) => (
    <Card>
        <div className="p-4 flex items-start justify-between gap-8">
            <div className="flex flex-col gap-1">
                {headline ? <SummaryLabel label={headline.label} tooltip={headline.tooltip} /> : <Skeleton className="w-32 h-4" />}
                {/* No plan slot means the headline is the plan name rather than a spend figure. */}
                <span className={cn(headline && !plan ? 'type-heading-sm' : 'type-heading-lg', 'text-text-strong')}>
                    {headline?.value ?? <Skeleton className="w-32 h-7" />}
                </span>
            </div>
            {/* 62px is the gap between the items in the design, off the spacing scale. */}
            <div className="flex items-start justify-end gap-[62px]">
                {plan && <SummaryItem label="PLAN">{plan.value}</SummaryItem>}
                {date && <SummaryItem label={date.label}>{date.value}</SummaryItem>}
                {payment && (
                    <SummaryItem label="PAYMENT METHOD">
                        <span className="capitalize">
                            {payment.card.brand ?? 'Card'}···{payment.card.last4}
                        </span>
                        {payment.action}
                    </SummaryItem>
                )}
            </div>
        </div>
        {change && (
            <>
                {/* Inset separator, matching the design's divider between the card row and the notice. */}
                <div className="mx-4 border-t border-border-muted" />
                <div className="px-4 py-3 type-text-regular-sm text-text-muted">
                    Your plan changes to <span className="font-ds-bold">{change.toPlanTitle}</span> on {change.at}
                    {change.detail ? ` — ${change.detail}` : '.'}
                </div>
            </>
        )}
    </Card>
);
