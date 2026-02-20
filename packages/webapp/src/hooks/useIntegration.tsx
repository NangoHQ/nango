import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { DeleteIntegration, GetIntegration, GetIntegrationFlows, GetIntegrations, PatchIntegration, PostIntegration } from '@nangohq/types';

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

export function usePostIntegration(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PostIntegration['Success'], APIError, PostIntegration['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/integrations?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PostIntegration['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['integrations', env] });
        }
    });
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

export function useDeleteIntegration(env: string, integrationId: string) {
    const queryClient = useQueryClient();
    return useMutation<DeleteIntegration['Success'], APIError>({
        mutationFn: async () => {
            const res = await apiFetch(`/api/v1/integrations/${integrationId}?env=${env}`, {
                method: 'DELETE'
            });
            const json = (await res.json()) as DeleteIntegration['Reply'];
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

export function useGetIntegrationFlows(env: string, integrationId: string) {
    return useQuery<GetIntegrationFlows['Success'], APIError>({
        queryKey: ['integrations', env, integrationId, 'flows'],
        queryFn: async (): Promise<GetIntegrationFlows['Success']> => {
            const res = await apiFetch(`/api/v1/integrations/${integrationId}/flows?env=${env}`, { method: 'GET' });
            const json = (await res.json()) as GetIntegrationFlows['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        enabled: Boolean(env && integrationId)
    });
}
