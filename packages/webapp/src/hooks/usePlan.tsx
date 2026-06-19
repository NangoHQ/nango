import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { APIError, apiFetch } from '../utils/api';
import { globalEnv } from '../utils/env';

import type {
    ApiPlan,
    BreakdownDimensions,
    GetBillingUsage,
    GetPlan,
    GetPlans,
    GetUsage,
    PostPlanChange,
    PostPlanExtendTrial,
    PutBillingInvoicingDetails,
    UsageMetric
} from '@nangohq/types';

export async function fetchCurrentPlan(env: string): Promise<GetPlan['Success']> {
    const res = await apiFetch(`/api/v1/plans/current?env=${env}`, { method: 'GET' });
    const json = (await res.json()) as GetPlan['Reply'];
    if (res.status !== 200 || 'error' in json) {
        throw new APIError({ res, json });
    }
    return json;
}

export function currentPlanQueryOptions(env: string) {
    return queryOptions<GetPlan['Success'], APIError>({
        enabled: Boolean(env) && globalEnv.features.plan,
        queryKey: ['plans', 'current', env],
        queryFn: () => fetchCurrentPlan(env)
    });
}

export function useApiGetCurrentPlan(env: string) {
    return useQuery(currentPlanQueryOptions(env));
}

export function planHasRbac(plan?: ApiPlan | null): boolean {
    if (!globalEnv.features.plan || !plan) {
        return true;
    }
    return plan.has_rbac;
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

export const GetUsageQueryKey = ['plans', 'usage'];

export function useApiGetUsage(env: string) {
    return useQuery<GetUsage['Success'], APIError>({
        enabled: Boolean(env),
        queryKey: GetUsageQueryKey,
        queryFn: async (): Promise<GetUsage['Success']> => {
            const res = await apiFetch(`/api/v1/plans/usage?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetUsage['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        refetchInterval: 1000 * 10 // 10 seconds
    });
}

export const GetBillingUsageQueryKey = ['plans', 'billing-usage'];

export function useApiGetBillingUsage(env: string, timeframe?: { start: string; end: string }, source?: 'clickhouse' | 'orb') {
    return useQuery<GetBillingUsage['Success'], APIError>({
        enabled: Boolean(env),
        queryKey: [...GetBillingUsageQueryKey, timeframe, source],
        queryFn: async (): Promise<GetBillingUsage['Success']> => {
            const params = new URLSearchParams({ env });
            if (timeframe) {
                params.append('from', timeframe.start);
                params.append('to', timeframe.end);
            }
            if (source) {
                params.append('source', source);
            }

            const res = await apiFetch(`/api/v1/plans/billing-usage?${params.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetBillingUsage['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

/**
 * Fetches one metric's breakdown: the top-N values of `dimension` plus a 'rest'
 * rollup, under `usage[metric].breakdown`. Always queries ClickHouse (breakdowns
 * don't exist on the Orb path). The panel's headline total still comes from
 * `useApiGetBillingUsage`.
 */
export function useApiGetBillingUsageBreakdown<M extends UsageMetric>(
    env: string,
    timeframe: { start: string; end: string } | undefined,
    metric: M,
    dimension: BreakdownDimensions[M] | null,
    top: number,
    options?: { enabled?: boolean }
) {
    return useQuery<GetBillingUsage['Success'], APIError>({
        enabled: Boolean(env) && Boolean(timeframe) && Boolean(dimension) && (options?.enabled ?? true),
        queryKey: [...GetBillingUsageQueryKey, 'breakdown', timeframe, metric, dimension, top],
        queryFn: async (): Promise<GetBillingUsage['Success']> => {
            const params = new URLSearchParams({ env });
            if (timeframe) {
                params.append('from', timeframe.start);
                params.append('to', timeframe.end);
            }
            // Breakdowns only exist on the ClickHouse path; force the source so it
            // resolves under the dev gate (FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE).
            params.append('source', 'clickhouse');
            params.append('metrics', metric);
            if (dimension) {
                params.append(`breakdown[${metric}]`, dimension);
            }
            params.append('top', String(top));

            const res = await apiFetch(`/api/v1/plans/billing-usage?${params.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetBillingUsage['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export function useTrial(plan?: ApiPlan | null): { isTrial: boolean; isTrialOver: boolean; daysRemaining: number } {
    const res = useMemo<{ isTrial: boolean; isTrialOver: boolean; daysRemaining: number }>(() => {
        if (!plan || !plan.auto_idle || !plan.trial_end_at) {
            return { isTrial: false, isTrialOver: false, daysRemaining: 0 };
        }
        const days = Math.floor((new Date(plan.trial_end_at).getTime() - new Date().getTime()) / (86400 * 1000));
        return { isTrial: true, isTrialOver: plan.trial_expired || false, daysRemaining: days };
    }, [plan]);

    return res;
}

export function usePutBillingInvoicingDetails(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PutBillingInvoicingDetails['Success'], APIError, PutBillingInvoicingDetails['Body']>({
        mutationFn: async (body): Promise<PutBillingInvoicingDetails['Success']> => {
            const res = await apiFetch(`/api/v1/plans/billing/invoicing?env=${env}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PutBillingInvoicingDetails['Reply'];
            if (res.status !== 200 || 'error' in json) throw new APIError({ res, json });
            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: GetBillingUsageQueryKey });
        }
    });
}

export function useApiPostPlanChange(env: string) {
    return useMutation<PostPlanChange['Success'], APIError, PostPlanChange['Body']>({
        mutationFn: async (body): Promise<PostPlanChange['Success']> => {
            const res = await apiFetch(`/api/v1/plans/change?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PostPlanChange['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}
