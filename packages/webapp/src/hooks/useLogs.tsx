import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

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
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<SearchFilters['Success']>();
    const [error, setError] = useState<SearchFilters['Errors']>();

    async function fetchData() {
        setLoading(true);
        try {
            const res = await apiFetch(`/api/v1/logs/filters?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            if (res.status !== 200) {
                setData(undefined);
                setError((await res.json()) as SearchFilters['Errors']);
                return;
            }

            setError(undefined);
            setData((await res.json()) as SearchFilters['Success']);
        } catch (err) {
            setData(undefined);
            setError(err as any);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (enabled && !loading) {
            void fetchData();
        }
    }, [env, enabled, body.category, body.search]);

    function trigger() {
        if (enabled && !loading) {
            void fetchData();
        }
    }

    return { data, error, loading, trigger };
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
        refetchInterval: 60 * 1000
    });

    return {
        loading: isLoading,
        error: error?.json,
        data: data?.data,
        refetch
    };
}
