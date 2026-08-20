import { formatBillingDate, nextUsageResetDate } from './billingPeriod';
import { formatMoneyFromCents } from './money';
import { showsSpendHeadline } from './planVisibility';

import type { ApiPlan, PlanDefinition, StripePaymentMethod } from '@nangohq/types';

export const SPEND_TOOLTIP =
    "Your base fee plus any usage beyond your plan's included quota. Any account credit is applied when the invoice is issued. Usage syncs daily, so this can be up to 24 hours behind.";

export interface SummaryStripHeadline {
    label: string;
    /** Null while the value is still resolving — the strip skeletons it in place. */
    value: string | null;
    /** Info tooltip beside the label. Only the spend headline carries one. */
    tooltip?: string;
}

/** Current-period spend as the caller's query holds it. A null amount means "no figure to show". */
export interface SummarySpend {
    pending: boolean;
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
    change: { toPlanTitle: string; at: string; detail: string | null } | null;
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
/**
 * The lead slot, falling back to the plan name whenever spend can't be stated. Zero is
 * deliberately not special-cased — the startup deal really does bill $0.00.
 */
function buildHeadline({
    plan,
    planTitle,
    spend
}: {
    plan: ApiPlan;
    planTitle: string;
    spend: SummarySpend | null;
}): Pick<SummaryStripState, 'headline' | 'plan'> {
    const asPlan = { headline: { label: 'CURRENT PLAN', value: planTitle }, plan: null };
    if (!spend || !showsSpendHeadline(plan)) {
        return asPlan;
    }

    const spendSlots = (value: string | null) => ({
        headline: { label: 'CURRENT PERIOD SPEND', value, tooltip: SPEND_TOOLTIP },
        plan: { value: planTitle }
    });

    if (spend.pending) {
        // The label needs only the plan, so it renders final while the figure resolves — no reflow.
        return spendSlots(null);
    }

    const formatted = spend.amountInCents === null ? null : formatMoneyFromCents(spend.amountInCents, spend.currency);
    return formatted === null ? asPlan : spendSlots(formatted);
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
    now
}: {
    plan: ApiPlan;
    plans: PlanDefinition[] | undefined;
    paymentMethod: StripePaymentMethod | null;
    canManageBilling: boolean;
    spend?: SummarySpend | null;
    now: Date;
}): SummaryStripState {
    const planTitle = planTitleOf(plan.name, plans);
    const isFree = plan.name === 'free';

    // A change only counts while it's still ahead of us and actually moves the customer somewhere
    // else. Same-plan rows are Orb-side repricings, and past-dated ones are stale mirrors that
    // nothing clears — neither is a plan change from the customer's point of view.
    const changeAt = plan.orb_future_plan_at ? new Date(plan.orb_future_plan_at) : null;
    const changeTo = plan.orb_future_plan;
    const change =
        changeTo && changeTo !== plan.name && changeAt && changeAt.getTime() > now.getTime()
            ? {
                  toPlanTitle: planTitleOf(changeTo, plans),
                  at: formatBillingDate(changeAt),
                  detail: changeDetail({ from: plan.name, toCode: changeTo, toTitle: planTitleOf(changeTo, plans) })
              }
            : null;

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
        ...buildHeadline({ plan, planTitle, spend: spend ?? null }),
        date,
        // Free never shows a payment method, even when a card is on file. Nor does an account with
        // no card — the slot is dropped rather than dashed, and the billing section below is where
        // a card gets added.
        payment: isFree || !canManageBilling || !paymentMethod ? null : { card: paymentMethod },
        change
    };
}
