import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useSWR from 'swr';

import { APIError, apiFetch, swrFetcher } from '../utils/api';

import type { SWRError } from '../utils/api';
import type { DeleteIntegration, GetIntegration, GetIntegrationFlows, GetIntegrations, PatchIntegration, PostIntegration } from '@nangohq/types';
import type { Cache, useSWRConfig } from 'swr';

export function useListIntegrations(env: string) {
    return useQuery<GetIntegrations['Success'], APIError>({
        queryKey: ['integrations', env],
        queryFn: async (): Promise<GetIntegrations['Success']> => {
            const res = await apiFetch(`/api/v1/integrations?env=${env}`, { method: 'GET' });
            const json = (await res.json()) as GetIntegrations['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        refetchInterval: 15000,
        enabled: Boolean(env)
    });
}

export function useGetIntegration(env: string, integrationId: string) {
    return useQuery<GetIntegration['Success'], APIError>({
        queryKey: ['integrations', env, integrationId],
        queryFn: async (): Promise<GetIntegration['Success']> => {
            const res = await apiFetch(`/api/v1/integrations/${integrationId}?env=${env}`, { method: 'GET' });
            const json = (await res.json()) as GetIntegration['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        enabled: Boolean(env && integrationId)
    });
}

export async function apiPostIntegration(env: string, body: PostIntegration['Body']) {
    const res = await apiFetch(`/api/v1/integrations?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostIntegration['Reply']
    };
}

export function usePatchIntegration(env: string, integrationId: string) {
    const queryClient = useQueryClient();
    return useMutation<PatchIntegration['Success'], APIError, PatchIntegration['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/integrations/${integrationId}?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PatchIntegration['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['integrations', env, integrationId] });
            void queryClient.invalidateQueries({ queryKey: ['integrations', env] });
        }
    });
}

export async function apiDeleteIntegration(env: string, integrationId: string) {
    const res = await apiFetch(`/api/v1/integrations/${integrationId}?env=${env}`, {
        method: 'DELETE'
    });

    return {
        res,
        json: (await res.json()) as DeleteIntegration['Reply']
    };
}

export function useGetIntegrationFlows(env: string, integrationId: string) {
    const { data, error, mutate } = useSWR<GetIntegrationFlows['Success'], SWRError<GetIntegrationFlows['Errors']>>(
        `/api/v1/integrations/${integrationId}/flows?env=${env}`,
        swrFetcher
    );

    const loading = !data && !error;

    return {
        loading,
        error: error?.json,
        data: data?.data,
        mutate
    };
}

export function clearIntegrationsCache(cache: Cache, mutate: ReturnType<typeof useSWRConfig>['mutate']) {
    for (const key of cache.keys()) {
        if (key.includes('/api/v1/integrations')) {
            void mutate(key, undefined);
        }
    }
}
