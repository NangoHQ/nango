import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetProvider } from '@nangohq/types';

export function useProvider(env: string, provider: string) {
    return useQuery<GetProvider['Success'], APIError>({
        queryKey: ['provider', env, provider],
        queryFn: async (): Promise<GetProvider['Success']> => {
            const res = await apiFetch(`/api/v1/providers/${encodeURIComponent(provider)}?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetProvider['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        enabled: Boolean(env && provider)
    });
}
