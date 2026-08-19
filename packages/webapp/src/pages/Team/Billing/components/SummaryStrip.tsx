import { Card } from '@nangohq/design-system';

import { Skeleton } from '@/components/ui/Skeleton';

export interface SummaryStripProps {
    /** Null renders a skeleton — the plan decides which other slots appear, so nothing else can resolve first. */
    planTitle: string | null;
    date?: { label: string; value: string } | null;
    /** Omitted whenever there's no card to show — Free, no card on file, or no billing permission. */
    payment?: { card: { brand?: string | null; last4: string }; action?: React.ReactNode } | null;
    /** Footer sentence for a scheduled plan change. */
    change?: { toPlanTitle: string; at: string; detail: string | null } | null;
}

const SummaryItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-col gap-1">
        <span className="type-text-regular-xs text-text-disabled">{label}</span>
        <div className="flex items-center gap-1.5 h-5 type-text-regular-sm text-text-default">{children}</div>
    </div>
);

/**
 * Presentational billing summary strip: current plan, a date whose meaning depends on the plan, and
 * the card on file. Pure — every decision about which slots appear is made by `buildSummaryState`.
 *
 * The design leads paid plans with a current-period spend figure instead of the plan name; that
 * figure needs an Orb spend read our backend doesn't have yet (NAN-6246), so the plan holds the
 * headline until then.
 */
export const SummaryStrip: React.FC<SummaryStripProps> = ({ planTitle, date, payment, change }) => (
    <Card>
        <div className="p-4 flex items-start justify-between gap-8">
            <div className="flex flex-col gap-1">
                <span className="type-text-regular-xs text-text-disabled">CURRENT PLAN</span>
                <span className="type-heading-lg text-text-strong">{planTitle ?? <Skeleton className="w-24 h-7" />}</span>
            </div>
            {/* 62px is the gap between the items in the design, off the spacing scale. */}
            <div className="flex items-start justify-end gap-[62px]">
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
