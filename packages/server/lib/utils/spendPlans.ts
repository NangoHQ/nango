import type { DBPlan } from '@nangohq/types';

// Monthly-billed plans only. `amount_due` is the whole upcoming invoice, so on an annual contract
// it states the contract total rather than this period's charge — $30,000 on one enterprise account.
// Exhaustive, so a new plan has to be classified rather than inheriting a figure.
const SPEND_PLANS: Record<DBPlan['name'], boolean> = {
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
