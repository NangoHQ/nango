import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch, isNoSessionApiError } from '../utils/api';

import type { GetMeta } from '@nangohq/types';

export const metaQueryKey = ['meta'] as const;

export function useMeta(enabled: boolean = true) {
    return useQuery<GetMeta['Success'], APIError>({
        enabled,
        queryKey: metaQueryKey,
        // A failed refetch keeps the cached meta, and the query cache's error handler signs a no-session user out.
        throwOnError: (error, query) => !query.state.data && !isNoSessionApiError(error),
        retry: (failureCount, error) => failureCount < 2 && (!(error instanceof APIError) || error.res.status >= 500),
        queryFn: async (): Promise<GetMeta['Success']> => {
            const res = await apiFetch('/api/v1/meta', {
                method: 'GET'
            });

            const json = (await res.json()) as GetMeta['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}
