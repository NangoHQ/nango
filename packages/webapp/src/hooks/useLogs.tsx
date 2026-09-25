import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetOperation, PostInsights, SearchFilters } from '@nangohq/types';

export function useGetOperation(env: string, params: GetOperation['Params']) {
    const { data, error, isLoading, isFetching, refetch } = useQuery<GetOperation['Success'], APIError>({
        queryKey: ['logs', 'operation', env, params.operationId],
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

export function useSearchFilters(enabled: boolean, env: string, body: SearchFilters['Body']) {
    const { data, error, isFetching } = useQuery<SearchFilters['Success'], APIError>({
        queryKey: ['logs', 'filters', env, body.category, body.search],
        queryFn: async ({ signal }): Promise<SearchFilters['Success']> => {
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
        enabled,
        placeholderData: keepPreviousData
    });

    return { data, error: error?.json, loading: isFetching };
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
