import type { ApiPlan, DBPlan } from '@nangohq/types';

// Plans on the current usage model. Any plan not listed here is treated as a legacy plan: different
// usage metrics, and billing terms negotiated per customer (several are annual, so there's no monthly
// reset to show).
// Typed against `DBPlan['name']` so a renamed or removed plan fails to compile instead of silently drifting.
const CURRENT_PLAN_NAMES: readonly DBPlan['name'][] = ['free', 'free-uncapped', 'startup-deal', 'enterprise-cloud-hosted', 'starter-v2', 'growth-v2'];

export function isLegacyPlan(plan: ApiPlan | null | undefined): boolean {
    if (!plan) {
        return false;
    }
    return !CURRENT_PLAN_NAMES.includes(plan.name);
}
