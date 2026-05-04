import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetUser, PatchUser } from '@nangohq/types';

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

export async function apiPatchUser(body: PatchUser['Body']) {
    const res = await apiFetch('/api/v1/user', {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PatchUser['Reply']
    };
}
