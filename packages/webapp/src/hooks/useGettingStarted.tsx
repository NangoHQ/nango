import { useMutation, useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetGettingStarted, PatchGettingStarted } from '@nangohq/types';

export function useGettingStarted(env: string) {
    const { data, error, isLoading, refetch } = useQuery<GetGettingStarted['Success'], APIError>({
        queryKey: ['getting-started', env],
        queryFn: async (): Promise<GetGettingStarted['Success']> => {
            const res = await apiFetch(`/api/v1/getting-started?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetGettingStarted['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        enabled: Boolean(env)
    });

    return {
        data,
        error,
        isLoading,
        refetch
    };
}

export function usePatchGettingStarted(env: string) {
    return useMutation<void, APIError, PatchGettingStarted['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/getting-started?env=${env}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                throw new APIError({ res, json: (await res.json()) as PatchGettingStarted['Errors'] });
            }
        }
    });
}
