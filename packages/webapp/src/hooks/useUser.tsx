import { useMutation, useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetUser, PatchUser, PutUserPassword } from '@nangohq/types';

export const userQueryKey = ['user'] as const;

export function useUser(enabled: boolean = true) {
    const query = useQuery<GetUser['Success'], APIError>({
        enabled,
        queryKey: userQueryKey,
        queryFn: async (): Promise<GetUser['Success']> => {
            const res = await apiFetch('/api/v1/user', {
                method: 'GET'
            });

            const json = (await res.json()) as GetUser['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });

    return {
        loading: query.isLoading,
        error: query.error?.json,
        user: query.data?.data,
        mutate: query.refetch
    };
}

export function usePatchUser() {
    return useMutation<PatchUser['Success'], APIError, PatchUser['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch('/api/v1/user', {
                method: 'PATCH',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PatchUser['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });
}

export function usePutUserPassword() {
    return useMutation<PutUserPassword['Success'], APIError, PutUserPassword['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch('/api/v1/user/password', {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            const json = (await res.json()) as PutUserPassword['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });
}
