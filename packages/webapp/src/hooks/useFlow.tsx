import { useMutation, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { PatchFlowDisable, PatchFlowEnable, PatchFlowFrequency, PostPreBuiltDeploy, PutUpgradePreBuiltFlow } from '@nangohq/types';

export function usePreBuiltDeployFlow(env: string, integrationId: string) {
    const queryClient = useQueryClient();
    return useMutation<PostPreBuiltDeploy['Success'], APIError, PostPreBuiltDeploy['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/flows/pre-built/deploy/?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PostPreBuiltDeploy['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['integrations', env, integrationId, 'flows'] });
        }
    });
}

export async function apiPreBuiltUpgrade(env: string, body: PutUpgradePreBuiltFlow['Body']) {
    const res = await apiFetch(`/api/v1/flows/pre-built/upgrade?env=${env}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PutUpgradePreBuiltFlow['Reply']
    };
}

export function useFlowEnable(env: string, integrationId: string) {
    const queryClient = useQueryClient();
    return useMutation<PatchFlowEnable['Success'], APIError, { params: PatchFlowEnable['Params']; body: PatchFlowEnable['Body'] }>({
        mutationFn: async ({ params, body }) => {
            const res = await apiFetch(`/api/v1/flows/${params.id}/enable?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PatchFlowEnable['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['integrations', env, integrationId, 'flows'] });
        }
    });
}

export function useFlowDisable(env: string, integrationId: string) {
    const queryClient = useQueryClient();
    return useMutation<PatchFlowDisable['Success'], APIError, { params: PatchFlowDisable['Params']; body: PatchFlowDisable['Body'] }>({
        mutationFn: async ({ params, body }) => {
            const res = await apiFetch(`/api/v1/flows/${params.id}/disable?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PatchFlowDisable['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['integrations', env, integrationId, 'flows'] });
        }
    });
}

export async function apiFlowUpdateFrequency(env: string, params: PatchFlowFrequency['Params'], body: PatchFlowFrequency['Body']) {
    const res = await apiFetch(`/api/v1/flows/${params.id}/frequency?env=${env}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PatchFlowFrequency['Reply']
    };
}
