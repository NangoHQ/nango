import { useQuery } from '@tanstack/react-query';

import { globalEnv } from '@/utils/env';

const host = 'https://api.apidownwatch.com';
const refetchInterval = 1 * 60 * 1000; // 1 minute

export interface ApiDownWatchResponse {
    status: 'operational' | 'degraded_performance' | 'major_outage' | 'unknown';
}

export function useApiDownWatch(service: string) {
    return useQuery<ApiDownWatchResponse>({
        enabled: true,
        queryKey: ['api-down-watch', service],
        queryFn: async () => {
            const res = await fetch(`${host}/api/${service}/status`, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${globalEnv.apiDownWatchApiKey}`
                }
            });

            const json = (await res.json()) as ApiDownWatchResponse;
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
