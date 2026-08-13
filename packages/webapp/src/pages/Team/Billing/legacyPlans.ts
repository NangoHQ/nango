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

export function isLegacyPlan(plan: ApiPlan | null | undefined): boolean {
    if (!plan) {
        return false;
    }
    return !PLAN_IS_CURRENT[plan.name];
}
