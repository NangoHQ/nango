import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetOperation, PostInsights, SearchFilters } from '@nangohq/types';

export function operationQueryKey(env: string, operationId: string) {
    return ['logs', 'operation', env, operationId];
}

export function useGetOperation(env: string, params: GetOperation['Params']) {
    const { data, error, isLoading, isFetching, refetch } = useQuery<GetOperation['Success'], APIError>({
        queryKey: operationQueryKey(env, params.operationId),
        queryFn: async (): Promise<GetOperation['Success']> => {
            const res = await apiFetch(`/api/v1/logs/operations/${params.operationId}?env=${env}`);

            const json = (await res.json()) as GetOperation['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });

    function trigger() {
        if (!isFetching) {
            void refetch();
        }
    }

    return {
        loading: isLoading,
        error,
        operation: data?.data,
        trigger
    };
}

function searchFiltersQuery(env: string, body: SearchFilters['Body']) {
    return {
        queryKey: ['logs', 'filters', env, body.category, body.search],
        queryFn: async ({ signal }: { signal: AbortSignal }): Promise<SearchFilters['Success']> => {
            const res = await apiFetch(`/api/v1/logs/filters?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body),
                signal
            });

            const json = (await res.json()) as SearchFilters['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        staleTime: 60_000
    };
}

export function useSearchFilters(enabled: boolean, env: string, body: SearchFilters['Body']) {
    const { data, error, isError, isFetching, refetch } = useQuery<SearchFilters['Success'], APIError>({
        ...searchFiltersQuery(env, body),
        enabled,
        placeholderData: keepPreviousData
    });

    return { data, error: error?.json, isError, loading: isFetching, refetch };
}

export function usePrefetchSearchFilters(env: string) {
    const queryClient = useQueryClient();
    return (category: SearchFilters['Body']['category']) => void queryClient.prefetchQuery(searchFiltersQuery(env, { category }));
}

export function usePostInsights(env: string, body: PostInsights['Body']) {
    const { data, error, isLoading, refetch } = useQuery<PostInsights['Success'], APIError>({
        queryKey: ['logs', 'insights', env, body],
        queryFn: async (): Promise<PostInsights['Success']> => {
            const res = await apiFetch(`/api/v1/logs/insights?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PostInsights['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        refetchInterval: 60 * 1000,
        refetchOnMount: 'always'
    });

    return {
        loading: isLoading,
        error: error?.json,
        data: data?.data,
        refetch
    };
}
