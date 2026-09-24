import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { AccountApiKey, CreateAccountApiKey, ListAccountApiKeys } from '@nangohq/types';

export const accountApiKeysQueryKey = ['account-api-keys'] as const;

export function useAccountApiKeys(enabled = true) {
    return useQuery<ListAccountApiKeys['Success'], APIError>({
        enabled,
        queryKey: accountApiKeysQueryKey,
        queryFn: async () => {
            const res = await apiFetch('/api/v1/account/api-keys');
            const json = (await res.json()) as ListAccountApiKeys['Success'] | { error: unknown };
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json: json as Record<string, unknown> });
            }
            return json;
        }
    });
}

export function useCreateAccountApiKey() {
    const queryClient = useQueryClient();
    return useMutation<CreateAccountApiKey['Success'], APIError, { display_name: string }>({
        mutationFn: async (body) => {
            const res = await apiFetch('/api/v1/account/api-keys', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as CreateAccountApiKey['Success'] | { error: unknown };
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json: json as Record<string, unknown> });
            }
            return json;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: accountApiKeysQueryKey });
        }
    });
}

export function useDeleteAccountApiKey() {
    const queryClient = useQueryClient();
    return useMutation<undefined, APIError, AccountApiKey['id']>({
        mutationFn: async (keyId) => {
            const res = await apiFetch(`/api/v1/account/api-keys/${keyId}`, { method: 'DELETE' });
            if (!res.ok) {
                const json = (await res.json()) as Record<string, unknown>;
                throw new APIError({ res, json });
            }
            return undefined;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: accountApiKeysQueryKey });
        }
    });
}
