import { migratesToPayAsYouGo } from './planVisibility';
import { pendingPlanChange } from './summaryState';

import type { ApiPlan, DBPlan, PlanDefinition } from '@nangohq/types';

const TARGET_CODE = 'pay-as-you-go';

export interface PlanTransition {
    at: string;
    toPlanTitle: string;
    fromCode: DBPlan['name'];
    /** Pay-as-you-go's flags match Starter's, so only Growth needs the add-on to keep what it has. */
    keepsGrowthAddOn: boolean;
}

/** Reads the schedule Orb mirrors into the plan, so an account nobody scheduled shows nothing at all. */
export function planTransition({
    plan,
    plans,
    now
}: {
    plan: ApiPlan | null | undefined;
    plans: PlanDefinition[] | undefined;
    now: Date;
}): PlanTransition | null {
    if (!plan || !migratesToPayAsYouGo(plan.name)) {
        return null;
    }

    const change = pendingPlanChange({ plan, plans, now });
    if (!change || change.toCode !== TARGET_CODE) {
        return null;
    }

    return {
        at: change.at,
        toPlanTitle: change.toPlanTitle,
        fromCode: plan.name,
        keepsGrowthAddOn: plan.name === 'growth-v2'
    };
}
