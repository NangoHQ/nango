import type { ApiPlan, DBPlan } from '@nangohq/types';

// Which plans are on the current usage model. Anything else is a legacy plan, measured with usage
// metrics the app can no longer show. This is purely about the metrics: a custom or negotiated
// contract does not make a plan legacy, which is why Enterprise counts as current.
// Exhaustive over `DBPlan['name']` rather than an allowlist, so adding a plan to the DB type fails
// to compile until it's classified here — otherwise a new current plan would silently be treated as
// legacy and lose its reset date.
const PLAN_IS_CURRENT: Record<DBPlan['name'], boolean> = {
    free: true,
    'pay-as-you-go': true,
    'free-uncapped': true,
    'startup-deal': true,
    enterprise: true,
    'enterprise-cloud-hosted': true,
    'starter-v2': true,
    'growth-v2': true,
    starter: false,
    growth: false,
    'starter-legacy': false,
    'scale-legacy': false,
    'growth-legacy': false
};

// Plans the summary strip renders for. A deliberately different question from `isLegacyPlan` above:
// `free-uncapped`, `enterprise` and `enterprise-cloud-hosted` are current plans that still get no
// strip, because nothing is billable or the contract is custom. Both maps are exhaustive over
// `DBPlan['name']`, so a new plan fails to compile until it is classified for both.
const SHOWS_SUMMARY_STRIP: Record<DBPlan['name'], boolean> = {
    free: true,
    'pay-as-you-go': true,
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

// Plans billed monthly, so a spend figure exists — gates the strip headline and the spend alerts
// section. The startup deal included, since its $0.00 is a real answer rather than a gap. The
// server enforces the same allowlist independently; drift here is a display bug, not a hole.
const HAS_MONTHLY_SPEND: Record<DBPlan['name'], boolean> = {
    'pay-as-you-go': true,
    'starter-v2': true,
    'growth-v2': true,
    'startup-deal': true,
    free: false,
    'free-uncapped': false,
    enterprise: false,
    'enterprise-cloud-hosted': false,
    starter: false,
    growth: false,
    'starter-legacy': false,
    'scale-legacy': false,
    'growth-legacy': false
};

// Plans that are actually billed. Both free tiers have a $0 base and no overage, so they have no
// invoices to link to — the header's "All invoices" action is pointless on them. Exhaustive over
// `DBPlan['name']` for the same reason as the maps above.
const PLAN_IS_BILLED: Record<DBPlan['name'], boolean> = {
    'pay-as-you-go': true,
    'starter-v2': true,
    'growth-v2': true,
    enterprise: true,
    'enterprise-cloud-hosted': true,
    'startup-deal': true,
    starter: true,
    growth: true,
    'starter-legacy': true,
    'scale-legacy': true,
    'growth-legacy': true,
    free: false,
    'free-uncapped': false
};

// Whether the plan can put a charge on the invoice at all. The startup deal has no base fee and
// never bills overage, so nothing accrues until it converts.
const PLAN_ACCRUES_CHARGES: Record<DBPlan['name'], boolean> = {
    'pay-as-you-go': true,
    'starter-v2': true,
    'growth-v2': true,
    'startup-deal': false,
    free: false,
    'free-uncapped': false,
    enterprise: false,
    'enterprise-cloud-hosted': false,
    starter: false,
    growth: false,
    'starter-legacy': false,
    'scale-legacy': false,
    'growth-legacy': false
};

// Plans September 2026 stops selling: their cards stay on screen but every CTA targeting one
// becomes Contact us. Which card *set* an account sees is `isOnS26Pricing`, a different question.
const PLAN_IS_RETIRED: Record<DBPlan['name'], boolean> = {
    'starter-v2': true,
    'growth-v2': true,
    starter: true,
    growth: true,
    'starter-legacy': true,
    'scale-legacy': true,
    'growth-legacy': true,
    free: false,
    'free-uncapped': false,
    'pay-as-you-go': false,
    'startup-deal': false,
    enterprise: false,
    'enterprise-cloud-hosted': false
};

export function showsSummaryStrip(plan: ApiPlan | null | undefined): boolean {
    if (!plan) {
        return false;
    }
    return SHOWS_SUMMARY_STRIP[plan.name];
}

export function isLegacyPlan(plan: ApiPlan | null | undefined): boolean {
    if (!plan) {
        return false;
    }
    return !PLAN_IS_CURRENT[plan.name];
}
/** Whether we state a current-period spend for this plan, and so offer the spend surfaces. */
export function hasMonthlySpend(plan: ApiPlan | null | undefined): boolean {
    if (!plan) {
        return false;
    }
    return HAS_MONTHLY_SPEND[plan.name];
}

/** Whether the plan is billed at all, and so has invoices worth linking to. */
export function isBilledPlan(plan: ApiPlan | null | undefined): boolean {
    if (!plan) {
        return false;
    }
    return PLAN_IS_BILLED[plan.name];
}

export function planAccruesCharges(plan: ApiPlan | null | undefined): boolean {
    if (!plan) {
        return false;
    }
    return PLAN_ACCRUES_CHARGES[plan.name];
}

export function isRetiredPlan(code: DBPlan['name']): boolean {
    return PLAN_IS_RETIRED[code];
}
