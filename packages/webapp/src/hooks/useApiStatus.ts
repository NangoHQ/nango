import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/utils/api';

import type { ApiStatusResponse } from '@nangohq/types';

const refetchInterval = 1 * 60 * 1000; // 1 minute

export function useApiStatus(service: string, env: string) {
    return useQuery<ApiStatusResponse>({
        enabled: true,
        queryKey: ['api-status', service],
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/api-status/${service}?env=${env}`, {
                method: 'GET'
            });

            const json = (await res.json()) as ApiStatusResponse;
            if (!res.ok || 'error' in json) {
                return {
                    status: 'unknown'
                };
            }

            return json;
        },
        refetchInterval
    });
}
