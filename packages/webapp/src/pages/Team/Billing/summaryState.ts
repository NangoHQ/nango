import { formatBillingDate, nextUsageResetDate } from './billingPeriod';
import { formatMoneyFromCents } from './money';
import { hasMonthlySpend, planAccruesCharges } from './planVisibility';

import type { ApiPlan, PlanDefinition, StripePaymentMethod } from '@nangohq/types';

const SPEND_CAVEATS = 'Any account credit is applied when the invoice is issued. Usage syncs daily, so this can be up to 24 hours behind.';

export const SPEND_TOOLTIP = `Next month's base fee plus this period's usage beyond your plan's included quota. ${SPEND_CAVEATS}`;

/** Orb prices Pay-as-you-go as a $50 plan-level minimum over the three metrics, not as a base fee. */
export const SPEND_TOOLTIP_S26 = `This period's usage, or the $50 monthly minimum, whichever is higher. ${SPEND_CAVEATS}`;

/** Drops the opening sentence for plans with no base fee and no billable overage. */
export const SPEND_TOOLTIP_WITHOUT_CHARGES = SPEND_CAVEATS;

export interface SummaryStripHeadline {
    label: string;
    value: string;
    /** Info tooltip beside the label. Only the spend headline carries one. */
    tooltip?: string;
}

/** Current-period spend as the caller's query holds it. A null amount means "no figure to show". */
export interface SummarySpend {
    amountInCents: number | null;
    currency: string | null;
}

export interface SummaryStripState {
    headline: SummaryStripHeadline;
    /** The plan name, demoted to a slot when spend leads. Null when the plan IS the headline. */
    plan: { value: string } | null;
    /** Omitted when no date can be stated truthfully — e.g. a deal whose conversion date we don't hold. */
    date: { label: string; value: string } | null;
    /** Null hides the slot entirely — Free, no card on file, or a viewer who can't manage billing. */
    payment: { card: StripePaymentMethod } | null;
    /** Renders the footer sentence; set only when a plan change is actually pending. */
    change: { toCode: string; toPlanTitle: string; at: string; detail: string | null } | null;
}

function planTitleOf(code: string, plans: PlanDefinition[] | undefined): string {
    return plans?.find((p) => p.code === code)?.title ?? code;
}

/** The clause after the date, for changes whose effect on the bill isn't obvious from the plan name. */
function changeDetail({ from, toCode, toTitle }: { from: string; toCode: string; toTitle: string }): string | null {
    // Both free plans have a $0 base and no overage, so there is nothing left to charge.
    if (toCode === 'free' || toCode === 'free-uncapped') {
        return 'no further charges after this period.';
    }
    if (from === 'startup-deal') {
        return `your startup deal ends and you'll be charged at standard ${toTitle} pricing.`;
    }
    // Moving between paid plans needs no gloss — the new plan's own pricing says it.
    return null;
}

/**
 * The lead slot, falling back to the plan name whenever spend can't be stated. Zero is
 * deliberately not special-cased — the startup deal really does bill $0.00.
 */
function buildHeadline({
    plan,
    planTitle,
    spend,
    onS26Pricing
}: {
    plan: ApiPlan;
    planTitle: string;
    spend: SummarySpend | null;
    onS26Pricing: boolean;
}): Pick<SummaryStripState, 'headline' | 'plan'> {
    const asPlan = { headline: { label: 'CURRENT PLAN', value: planTitle }, plan: null };
    if (!spend || !hasMonthlySpend(plan)) {
        return asPlan;
    }

    const formatted = spend.amountInCents === null ? null : formatMoneyFromCents(spend.amountInCents, spend.currency);
    if (formatted === null) {
        return asPlan;
    }

    let tooltip = SPEND_TOOLTIP_WITHOUT_CHARGES;
    if (planAccruesCharges(plan)) {
        tooltip = onS26Pricing ? SPEND_TOOLTIP_S26 : SPEND_TOOLTIP;
    }

    return {
        headline: { label: 'CURRENT PERIOD SPEND', value: formatted, tooltip },
        plan: { value: planTitle }
    };
}

/**
 * The account's pending plan change, or null when there isn't one worth showing.
 *
 * A change only counts while it's still ahead of us and actually moves the customer somewhere else.
 * Same-plan rows are Orb-side repricings, and past-dated ones are stale mirrors that nothing clears
 * — neither is a plan change from the customer's point of view. Shared with the alert above the plan
 * cards so both surfaces agree on what counts as pending.
 */
export function pendingPlanChange({ plan, plans, now }: { plan: ApiPlan; plans: PlanDefinition[] | undefined; now: Date }): SummaryStripState['change'] {
    const changeAt = plan.orb_future_plan_at ? new Date(plan.orb_future_plan_at) : null;
    const changeTo = plan.orb_future_plan;

    // A malformed timestamp parses to NaN, and every comparison against NaN is false, so it would
    // slip past the past-dated check and render "Invalid Date".
    if (!changeTo || changeTo === plan.name || !changeAt || Number.isNaN(changeAt.getTime()) || changeAt.getTime() <= now.getTime()) {
        return null;
    }

    // Without the plans list the only available name is the raw Orb code, so say nothing rather than
    // "Switches to growth-v2". A cancellation names no destination, so it still renders.
    const toPlanTitle = plans?.find((p) => p.code === changeTo)?.title;
    const isCancellation = changeTo === 'free' || changeTo === 'free-uncapped';
    if (!toPlanTitle && !isCancellation) {
        return null;
    }

    return {
        toCode: changeTo,
        toPlanTitle: toPlanTitle ?? changeTo,
        at: formatBillingDate(changeAt),
        detail: changeDetail({ from: plan.name, toCode: changeTo, toTitle: toPlanTitle ?? changeTo })
    };
}

/**
 * Everything the strip shows, derived in one place so the rules are testable without React.
 *
 * The date slot carries three different meanings, which is why it isn't a single "reset" value:
 * Free's caps reset on the UTC calendar month, paid plans renew on their billing period, and an
 * account with a scheduled change isn't doing either — it's changing plan.
 */
export function buildSummaryState({
    plan,
    plans,
    paymentMethod,
    canManageBilling,
    spend,
    onS26Pricing,
    now
}: {
    plan: ApiPlan;
    plans: PlanDefinition[] | undefined;
    paymentMethod: StripePaymentMethod | null;
    canManageBilling: boolean;
    spend?: SummarySpend | null;
    onS26Pricing: boolean;
    now: Date;
}): SummaryStripState {
    const planTitle = planTitleOf(plan.name, plans);
    const isFree = plan.name === 'free';
    const change = pendingPlanChange({ plan, plans, now });

    let date: SummaryStripState['date'] = null;
    if (change) {
        date = { label: 'CHANGES ON', value: change.at };
    } else if (isFree) {
        date = { label: 'LIMITS RESET', value: formatBillingDate(nextUsageResetDate(now)) };
    } else if (plan.name !== 'startup-deal') {
        // The deal never renews — it always converts — so with no change date we say nothing rather
        // than claim a renewal. The missing dates are a data gap (NAN-6640), not a display state.
        date = { label: 'RENEWS ON', value: formatBillingDate(nextUsageResetDate(now)) };
    }

    return {
        ...buildHeadline({ plan, planTitle, spend: spend ?? null, onS26Pricing }),
        date,
        // Free never shows a payment method, even when a card is on file. Nor does an account with
        // no card — the slot is dropped rather than dashed, and the billing section below is where
        // a card gets added.
        payment: isFree || !canManageBilling || !paymentMethod ? null : { card: paymentMethod },
        change
    };
}
