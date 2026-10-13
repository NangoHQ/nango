import { GROWTH_ADD_ON_IN_CENTS, MINIMUM_IN_CENTS } from '@nangohq/billing';
import { getPlanDefinition } from '@nangohq/shared';

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

export function getSpendFloorInCents(plan: Pick<DBPlan, 'name' | 'has_growth_features'>): number {
    if (plan.name === 'pay-as-you-go') {
        // Only pay-as-you-go bills the add-on on top: growth-v2 and startup-deal also carry the flag ahead of a migration.
        return MINIMUM_IN_CENTS + (plan.has_growth_features ? GROWTH_ADD_ON_IN_CENTS : 0);
    }
    return (getPlanDefinition(plan.name)?.basePrice ?? 0) * 100;
}
