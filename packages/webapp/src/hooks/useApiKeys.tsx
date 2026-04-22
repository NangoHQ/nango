import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

export interface ApiKeyListItem {
    id: number;
    display_name: string;
    scopes: string[];
    secret: string;
    last_used_at: string | null;
    created_at: string;
    updated_at: string;
}

export const apiKeysQueryKey = (env: string) => [env, 'api-keys'] as const;

export function useApiKeys(env: string) {
    return useQuery<{ data: ApiKeyListItem[] }, APIError>({
        enabled: Boolean(env),
        queryKey: apiKeysQueryKey(env),
        queryFn: async (): Promise<{ data: ApiKeyListItem[] }> => {
            const res = await apiFetch(`/api/v1/environment/api-keys?env=${env}`);

            const json = (await res.json()) as { data: ApiKeyListItem[] } | { error: unknown };
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json: json as Record<string, unknown> });
            }

            return json as { data: ApiKeyListItem[] };
        }
    });
}

export function useCreateApiKey(env: string) {
    const queryClient = useQueryClient();
    return useMutation<{ data: ApiKeyListItem }, APIError, { display_name: string; scopes?: string[] }>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/environment/api-keys?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as { data: ApiKeyListItem } | { error: unknown };
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json: json as Record<string, unknown> });
            }

            return json as { data: ApiKeyListItem };
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(env) });
        }
    });
}

export function useUpdateApiKey(env: string) {
    const queryClient = useQueryClient();
    return useMutation<undefined, APIError, { keyId: number; scopes?: string[]; display_name?: string }>({
        mutationFn: async ({ keyId, ...body }) => {
            const res = await apiFetch(`/api/v1/environment/api-keys/${keyId}?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const json = (await res.json()) as Record<string, unknown>;
                throw new APIError({ res, json });
            }

            return undefined;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(env) });
        }
    });
}

export function useDeleteApiKey(env: string) {
    const queryClient = useQueryClient();
    return useMutation<undefined, APIError, number>({
        mutationFn: async (keyId) => {
            const res = await apiFetch(`/api/v1/environment/api-keys/${keyId}?env=${env}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const json = (await res.json()) as Record<string, unknown>;
                throw new APIError({ res, json });
            }

            return undefined;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(env) });
        }
    });
}
