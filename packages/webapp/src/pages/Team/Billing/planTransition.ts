import { migratesToPayAsYouGo } from './planVisibility';
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

/** Only a change Orb has scheduled counts. An account we never scheduled sees no transition. */
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
        fromTitle: plans?.find((p) => p.code === plan.name)?.title ?? plan.name,
        keepsGrowthAddOn: plan.name === 'growth-v2'
    };
}
