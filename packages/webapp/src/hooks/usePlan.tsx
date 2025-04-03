import { useMemo } from 'react';

import { apiFetch } from '../utils/api';

import type { ApiPlan, PostPlanExtendTrial } from '@nangohq/types';

export async function apiPostPlanExtendTrial(env: string) {
    const res = await apiFetch(`/api/v1/plan/extend_trial?env=${env}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as PostPlanExtendTrial['Reply']
    };
}

export function useTrial(plan?: ApiPlan | null): [boolean, number] {
    const res = useMemo<[boolean, number]>(() => {
        if (!plan || plan.name !== 'free' || !plan.trial_end_at) {
            return [false, 0];
        }
        const days = Math.ceil((new Date(plan.trial_end_at).getTime() - new Date().getTime()) / (86400 * 1000));
        return [days >= 0, days];
    }, [plan]);

    return res;
}
