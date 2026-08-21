import type { ApiPlan, DBPlan } from '@nangohq/types';

// Which plans are on the current usage model. Anything else is a legacy plan: different usage
// metrics, and billing terms negotiated per customer (several are annual, so there's no monthly
// reset to show).
// Exhaustive over `DBPlan['name']` rather than an allowlist, so adding a plan to the DB type fails
// to compile until it's classified here — otherwise a new current plan would silently be treated as
// legacy and lose its reset date.
const PLAN_IS_CURRENT: Record<DBPlan['name'], boolean> = {
    free: true,
    'free-uncapped': true,
    'startup-deal': true,
    'enterprise-cloud-hosted': true,
    'starter-v2': true,
    'growth-v2': true,
    enterprise: false,
    starter: false,
    growth: false,
    'starter-legacy': false,
    'scale-legacy': false,
    'growth-legacy': false
};

// Plans the summary strip renders for. A deliberately different question from `isLegacyPlan` above:
// `free-uncapped` and `enterprise-cloud-hosted` are current plans that still get no strip, because
// nothing is billable or the contract is custom. Both maps are exhaustive over `DBPlan['name']`, so
// a new plan fails to compile until it is classified for both.
const SHOWS_SUMMARY_STRIP: Record<DBPlan['name'], boolean> = {
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

// Plans billed monthly, so a spend figure exists — gates the strip headline and the spend alerts
// section. The startup deal included, since its $0.00 is a real answer rather than a gap.
const HAS_MONTHLY_SPEND: Record<DBPlan['name'], boolean> = {
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
