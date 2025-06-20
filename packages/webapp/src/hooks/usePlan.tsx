import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { APIError, apiFetch } from '../utils/api';

import type { ApiPlan, GetPlan, GetPlans, GetUsage, PostPlanChange, PostPlanExtendTrial } from '@nangohq/types';

export async function apiGetCurrentPlan(env: string) {
    const res = await apiFetch(`/api/v1/plans/current?env=${env}`, {
        method: 'GET'
    });

    return {
        res,
        json: (await res.json()) as GetPlan['Reply']
    };
}
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

export function useApiGetUsage(env: string) {
    return useQuery<GetUsage['Success'], APIError>({
        enabled: Boolean(env),
        queryKey: ['plans', 'usage'],
        queryFn: async (): Promise<GetUsage['Success']> => {
            const res = await apiFetch(`/api/v1/plans/usage?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetUsage['Reply'];
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

export async function apiPostPlanChange(env: string, body: PostPlanChange['Body']) {
    const res = await apiFetch(`/api/v1/plans/change?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostPlanChange['Reply']
    };
}
