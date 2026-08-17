import { formatBillingDate, nextUsageResetDate } from './billingPeriod';

import type { ApiPlan, PlanDefinition, StripePaymentMethod } from '@nangohq/types';

// Plans the strip renders for. Everything else — legacy, enterprise, free-uncapped — hides it
// entirely: terms are negotiated per customer or nothing is billable, so no field would be true.
// Typed against `ApiPlan['name']` so a new plan fails to compile until it's classified here.
const STRIP_PLANS: Record<ApiPlan['name'], boolean> = {
    free: true,
    'starter-v2': true,
    'growth-v2': true,
    'startup-deal': true,
    'free-uncapped': false,
    enterprise: false,
    'enterprise-cloud-hosted': false,
    starter: false,
    growth: false,
    'starter-legacy': false,
    'scale-legacy': false,
    'growth-legacy': false
};

export function showsSummaryStrip(plan: ApiPlan | null | undefined): boolean {
    if (!plan) {
        return false;
    }
    return STRIP_PLANS[plan.name];
}

export interface SummaryStripState {
    planTitle: string;
    /** Omitted when no date can be stated truthfully — e.g. a deal whose conversion date we don't hold. */
    date: { label: string; value: string } | null;
    /** Null hides the slot entirely — Free, no card on file, or a viewer who can't manage billing. */
    payment: { card: StripePaymentMethod } | null;
    /** Renders the footer sentence; set only when a plan change is actually pending. */
    change: { toPlanTitle: string; at: string; detail: string } | null;
}

function planTitleOf(code: string, plans: PlanDefinition[] | undefined): string {
    return plans?.find((p) => p.code === code)?.title ?? code;
}

/** The clause after the date, which depends on what the change actually means for the bill. */
function changeDetail({ from, toCode, toTitle }: { from: string; toCode: string; toTitle: string }): string {
    // Both free plans have a $0 base and no overage, so there is nothing left to charge.
    if (toCode === 'free' || toCode === 'free-uncapped') {
        return 'no further charges after this period.';
    }
    if (from === 'startup-deal') {
        return `your startup deal ends and you'll be charged at standard ${toTitle} pricing.`;
    }
    return `you'll be charged at standard ${toTitle} pricing.`;
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
    now
}: {
    plan: ApiPlan;
    plans: PlanDefinition[] | undefined;
    paymentMethod: StripePaymentMethod | null;
    canManageBilling: boolean;
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
        planTitle,
        date,
        // Free never shows a payment method, even when a card is on file. Nor does an account with
        // no card — the slot is dropped rather than dashed, and the billing section below is where
        // a card gets added.
        payment: isFree || !canManageBilling || !paymentMethod ? null : { card: paymentMethod },
        change
    };
}
