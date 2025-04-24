import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { APIError, apiFetch } from '../utils/api';

import type { ApiPlan, GetPlans, PostPlanExtendTrial } from '@nangohq/types';

export async function apiPostPlanExtendTrial(env: string) {
    const res = await apiFetch(`/api/v1/plans/trial/extension?env=${env}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as PostPlanExtendTrial['Reply']
    };
}

export function useApiGetPlans(env: string) {
    return useQuery<GetPlans['Success'], APIError>({
        enabled: Boolean(env),
        queryKey: ['plans'],
        queryFn: async (): Promise<GetPlans['Success']> => {
            const res = await apiFetch(`/api/v1/plans?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetPlans['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export function useTrial(plan?: ApiPlan | null): { isTrial: boolean; isTrialOver: boolean; daysRemaining: number } {
    const res = useMemo<{ isTrial: boolean; isTrialOver: boolean; daysRemaining: number }>(() => {
        if (!plan || !plan.trial_end_at) {
            return { isTrial: false, isTrialOver: false, daysRemaining: 0 };
        }
        const days = Math.floor((new Date(plan.trial_end_at).getTime() - new Date().getTime()) / (86400 * 1000));
        return { isTrial: true, isTrialOver: plan.trial_expired || false, daysRemaining: days };
    }, [plan]);

    return res;
}
