import { useMemo } from 'react';

import { apiFetch } from '../utils/api';

import type { ApiPlan, PostPlanExtendTrial } from '@nangohq/types';

export async function apiPostPlanExtendTrial(env: string) {
    const res = await apiFetch(`/api/v1/plan/trial/extension?env=${env}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as PostPlanExtendTrial['Reply']
    };
}

export function useTrial(plan?: ApiPlan | null): { isTrial: boolean; isTrialOver: boolean; daysRemaining: number } {
    const res = useMemo<{ isTrial: boolean; isTrialOver: boolean; daysRemaining: number }>(() => {
        if (!plan || !plan.trial_end_at) {
            return { isTrial: false, isTrialOver: false, daysRemaining: 0 };
        }
        const days = Math.floor((new Date(plan.trial_end_at).getTime() - new Date().getTime()) / (86400 * 1000));
        return { isTrial: true, isTrialOver: days < 0, daysRemaining: days };
    }, [plan]);

    return res;
}
