import type { DBPlan } from '@nangohq/types';

// Plans billed monthly with usage-based overage — the only ones where "this period's spend" means
// anything. An annual contract's own invoice states its whole contract total, not one period's charge.
// Exhaustive, so a new plan has to be classified rather than inheriting a figure.
const SPEND_PLANS: Record<DBPlan['name'], boolean> = {
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

export function isSpendPlan(plan: Pick<DBPlan, 'name'>): boolean {
    // Compared against `true` so an unlisted name colliding with an Object.prototype key can't read as allowed.
    return SPEND_PLANS[plan.name] === true;
}
