import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useSWR from 'swr';

import { APIError, apiFetch, swrFetcher } from '../utils/api';

import type { SWRError } from '../utils/api';
import type { DeleteConnection, GetConnection, GetConnections, GetConnectionsCount, PostConnectionRefresh } from '@nangohq/types';
import type { Cache, useSWRConfig } from 'swr';

export function useConnections(queries: Omit<GetConnections['Querystring'], 'page'>) {
    return useInfiniteQuery<GetConnections['Success'], APIError>({
        queryKey: ['connections', 'list', queries],
        queryFn: async ({ pageParam = 0 }): Promise<GetConnections['Success']> => {
            const usp = new URLSearchParams();
            if (queries.env) {
                usp.set('env', queries.env);
            }
            if (queries.search) {
                usp.set('search', queries.search);
            }
            if (queries.integrationIds && queries.integrationIds.length > 0) {
                usp.append('integrationIds', queries.integrationIds.join(','));
            }
            if (queries.withError !== undefined) {
                usp.set('withError', String(queries.withError));
            }
            usp.set('page', String(pageParam));

            const res = await apiFetch(`/api/v1/connections?${usp.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetConnections['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        getNextPageParam: (lastPage, allPages) => {
            // If last page has less than 20 items, we're on the last page
            if (lastPage.data.length < 20) {
                return undefined;
            }
            // Otherwise, return next page number
            return allPages.length;
        },
        initialPageParam: 0,
        enabled: Boolean(queries.env)
    });
}

export function clearConnectionsCache(cache: Cache, mutate: ReturnType<typeof useSWRConfig>['mutate']) {
    for (const key of cache.keys()) {
        if (key.includes('/api/v1/connections')) {
            void mutate(key, undefined);
            cache.delete(key);
        }
    }
}

export function useConnectionsCount(env: string) {
    const { data, error, mutate } = useSWR<GetConnectionsCount['Success'], SWRError<GetConnectionsCount['Errors']>>(
        `/api/v1/connections/count?env=${env}`,
        swrFetcher,
        { refreshInterval: 10000, keepPreviousData: true }
    );

    const loading = !data && !error;

    return { loading, error: error?.json, data, mutate };
}

export function useConnection(queries: GetConnection['Querystring'], params: GetConnection['Params']) {
    const { data, error, mutate } = useSWR<GetConnection['Success'], SWRError<GetConnection['Errors']>>(
        `/api/v1/connections/${encodeURIComponent(params.connectionId)}?env=${queries.env}&provider_config_key=${encodeURIComponent(queries.provider_config_key)}`,
        swrFetcher
    );

    const loading = !data && !error;

    return { loading, error: error?.json, data: data?.data, mutate };
}

export async function apiRefreshConnection(params: PostConnectionRefresh['Params'], query: PostConnectionRefresh['Querystring']) {
    const res = await apiFetch(`/api/v1/connections/${params.connectionId}/refresh?${new URLSearchParams(query).toString()}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as PostConnectionRefresh['Reply']
    };
}

export function useDeleteConnection() {
    const queryClient = useQueryClient();
    return useMutation<
        { res: Response; json: DeleteConnection['Reply'] },
        APIError,
        { params: DeleteConnection['Params']; query: DeleteConnection['Querystring'] }
    >({
        mutationFn: async ({ params, query }) => {
            const queryString = new URLSearchParams({
                env: query.env,
                provider_config_key: query.provider_config_key
            }).toString();
            const res = await apiFetch(`/api/v1/connections/${params.connectionId}?${queryString}`, {
                method: 'DELETE'
            });

            const json = (await res.json()) as DeleteConnection['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return {
                res,
                json
            };
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['connections'] });
        }
    });
}
