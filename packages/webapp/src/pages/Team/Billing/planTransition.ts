import { isRetiredPlan } from './planVisibility';
import { pendingPlanChange } from './summaryState';

import type { ApiPlan, DBPlan, PlanDefinition } from '@nangohq/types';

const TARGET_CODE = 'pay-as-you-go';

export interface PlanTransition {
    at: string;
    toPlanTitle: string;
    fromCode: DBPlan['name'];
    fromTitle: string;
    keepsGrowthAddOn: boolean;
}

export function planTransition({
    plan,
    plans,
    now
}: {
    plan: ApiPlan | null | undefined;
    plans: PlanDefinition[] | undefined;
    now: Date;
}): PlanTransition | null {
    if (!plan) {
        return null;
    }

    const change = pendingPlanChange({ plan, plans, now });
    if (!change || change.toCode !== TARGET_CODE) {
        return null;
    }

    // Enterprise and the startup deal can also be scheduled onto Pay-as-you-go, but that is an
    // ordinary change and each has its own copy for it. Only a retired plan is migrating.
    if (!isRetiredPlan(plan.name)) {
        return null;
    }

    const definition = plans?.find((p) => p.code === plan.name);

    return {
        at: change.at,
        toPlanTitle: change.toPlanTitle,
        fromCode: plan.name,
        fromTitle: definition?.title ?? plan.name,
        keepsGrowthAddOn: definition?.keepsGrowthAddOnOnMigration ?? false
    };
}
