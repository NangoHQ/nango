import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { metaQueryKey } from './useMeta';
import { APIError, apiFetch } from '../utils/api';

import type { GetEnvironment, PatchEnvironment, PatchWebhook, PostEnvironment, PostEnvironmentVariables } from '@nangohq/types';

export const environmentQueryKey = (env: string) => [env, 'environment'] as const;

export function useEnvironment(env: string) {
    return useQuery<GetEnvironment['Success'], APIError>({
        enabled: Boolean(env),
        queryKey: environmentQueryKey(env),
        queryFn: async (): Promise<GetEnvironment['Success']> => {
            const res = await apiFetch(`/api/v1/environments/current?env=${env}`);

            const json = (await res.json()) as GetEnvironment['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}

export function usePatchEnvironment(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PatchEnvironment['Success'], APIError, PatchEnvironment['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/environments?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PatchEnvironment['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) });
        }
    });
}

export function usePatchWebhook(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PatchWebhook['Success'], APIError, PatchWebhook['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/environments/webhook?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PatchWebhook['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) });
        }
    });
}

export function usePostVariables(env: string) {
    const queryClient = useQueryClient();
    return useMutation<PostEnvironmentVariables['Success'], APIError, PostEnvironmentVariables['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/environments/variables?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PostEnvironmentVariables['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) });
        }
    });
}

export function usePostEnvironment() {
    const queryClient = useQueryClient();
    return useMutation<PostEnvironment['Success'], APIError, PostEnvironment['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch('/api/v1/environments', {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PostEnvironment['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: metaQueryKey });
        }
    });
}

export function useDeleteEnvironment(env: string) {
    const queryClient = useQueryClient();
    return useMutation<undefined, APIError>({
        mutationFn: async () => {
            const res = await apiFetch(`/api/v1/environments?env=${env}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const json = (await res.json()) as Record<string, unknown>;
                throw new APIError({ res, json });
            }
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: metaQueryKey });
        }
    });
}
