import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetProviders } from '@nangohq/types';

export function useProviders(env: string) {
    return useQuery<GetProviders['Success'], APIError>({
        queryKey: ['providers', env],
        queryFn: async (): Promise<GetProviders['Success']> => {
            const res = await apiFetch(`/api/v1/providers?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetProviders['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        enabled: Boolean(env)
    });
}
