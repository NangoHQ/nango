import { useMemo } from 'react';

import { useApiGetPlans, useCurrentPlan } from '@/hooks/usePlan';
import { useStore } from '@/store';
import { planTransition } from './planTransition';

import type { PlanTransition } from './planTransition';

export function usePlanTransition(): PlanTransition | null {
    const env = useStore((state) => state.env);
    const { data: environmentData, isError: didPlanFail } = useCurrentPlan(env);
    const { data: plansList } = useApiGetPlans(env);
    // A stale cached plan could announce a migration that is no longer scheduled.
    const plan = didPlanFail ? null : environmentData?.plan;

    return useMemo(() => planTransition({ plan, plans: plansList?.data, now: new Date() }), [plan, plansList]);
}
