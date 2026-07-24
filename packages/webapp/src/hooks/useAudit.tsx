import { useInfiniteQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetAuditTrail } from '@nangohq/types';

export function useApiGetAuditTrail(env: string, filters: { from?: string | undefined; to?: string | undefined }, options?: { enabled?: boolean }) {
    return useInfiniteQuery<GetAuditTrail['Success'], APIError, { pages: GetAuditTrail['Success'][] }, unknown[], string | null>({
        enabled: Boolean(env) && (options?.enabled ?? true),
        queryKey: [env, 'audit-trail:infinite', filters.from ?? null, filters.to ?? null],
        queryFn: async ({ pageParam, signal }) => {
            const params = new URLSearchParams({ env });
            if (pageParam) {
                params.append('cursor', pageParam);
            }
            if (filters.from) {
                params.append('from', filters.from);
            }
            if (filters.to) {
                params.append('to', filters.to);
            }

            const res = await apiFetch(`/api/v1/audit-trail?${params.toString()}`, { method: 'GET', signal });
            const json = (await res.json()) as GetAuditTrail['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
        refetchOnWindowFocus: false
    });
}
