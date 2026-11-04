import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetProviderTemplates } from '@nangohq/types';

export function useProviderTemplates(env: string, provider: string | undefined) {
    return useQuery<GetProviderTemplates['Success'], APIError>({
        queryKey: ['provider', env, provider, 'templates'],
        queryFn: async (): Promise<GetProviderTemplates['Success']> => {
            if (!provider) {
                throw new Error('Provider is undefined');
            }

            const res = await apiFetch(`/api/v1/providers/${encodeURIComponent(provider)}/templates?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetProviderTemplates['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        enabled: Boolean(env && provider)
    });
}
