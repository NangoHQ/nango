import type { GetOperation, SearchMessages, SearchOperations } from '@nangohq/types';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher } from '../utils/api';

export function useSearchOperations(env: string, body: SearchOperations['Body']) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<SearchOperations['Success']>();
    const [error, setError] = useState<SearchOperations['Errors']>();

    async function fetchData() {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/logs/operations?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.status !== 200) {
                setData(undefined);
                setError((await res.json()) as SearchOperations['Errors']);
                return;
            }

            setError(undefined);
            setData((await res.json()) as SearchOperations['Success']);
        } catch (err) {
            console.log(err);
            setData(undefined);
            setError(err as any);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!loading) {
            void fetchData();
        }
    }, [env, body.limit, body.states]);

    return { data, error, loading };
}

export function useGetOperation(env: string, params: GetOperation['Params']) {
    const { data, error } = useSWR<GetOperation['Success']>(`/api/v1/logs/operations/${params.operationId}?env=${env}`, swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        operation: data?.data
    };
}

export function useSearchMessages(env: string, body: SearchMessages['Body']) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<SearchMessages['Success']>();
    const [error, setError] = useState<SearchMessages['Errors']>();

    async function fetchData() {
        setLoading(true);
        try {
            const res = await fetch(`/api/v1/logs/messages?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.status !== 200) {
                setData(undefined);
                setError((await res.json()) as SearchMessages['Errors']);
                return;
            }

            setError(undefined);
            setData((await res.json()) as SearchMessages['Success']);
        } catch (err) {
            console.log(err);
            setData(undefined);
            setError(err as any);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!loading) {
            void fetchData();
        }
    }, [env, body.operationId, body.limit, body.states, body.search]);

    return { data, error, loading };
}
