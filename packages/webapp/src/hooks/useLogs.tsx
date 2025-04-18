import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { apiFetch, swrFetcher } from '../utils/api';

import type { SWRError } from '../utils/api';
import type { GetOperation, PostInsights, SearchFilters } from '@nangohq/types';

export function useGetOperation(env: string, params: GetOperation['Params']) {
    const { data, error, mutate } = useSWR<GetOperation['Success'], SWRError<GetOperation['Errors']>>(
        `/api/v1/logs/operations/${params.operationId}?env=${env}`,
        swrFetcher
    );

    const loading = !data && !error;

    function trigger() {
        if (!loading) {
            void mutate();
        }
    }

    return {
        loading,
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
    const { data, error, mutate } = useSWR<PostInsights['Success'], SWRError<PostInsights['Errors']>>(
        [`/api/v1/logs/insights?env=${env}`, body],
        ([url, body]) => swrFetcher(url, { method: 'POST', body: JSON.stringify(body) }),
        { refreshInterval: 60 * 1000, revalidateIfStale: false, revalidateOnMount: true }
    );

    const loading = !data && !error;

    return {
        loading,
        error: error?.json,
        data: data?.data,
        mutate
    };
}
