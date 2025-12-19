import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/utils/api';

const refetchInterval = 1 * 60 * 1000; // 1 minute

export interface ServiceStatusResponse {
    status: 'operational' | 'degraded_performance' | 'major_outage' | 'unknown';
}

export function useServiceStatus(service: string) {
    return useQuery<ServiceStatusResponse>({
        enabled: true,
        queryKey: ['service-status', service],
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/service-status/${service}`, {
                method: 'GET'
            });

            const json = (await res.json()) as ServiceStatusResponse;
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
