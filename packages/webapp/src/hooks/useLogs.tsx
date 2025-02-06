import type { GetOperation, PostInsights, SearchFilters, SearchMessages, SearchOperations } from '@nangohq/types';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import type { SWRError } from '../utils/api';
import { apiFetch, swrFetcher } from '../utils/api';
import { slidePeriod } from '../utils/logs';

export function useSearchOperations(env: string, body: SearchOperations['Body'], isLive: boolean) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<SearchOperations['Success']>();
    const [error, setError] = useState<SearchOperations['Errors']>();
    const signal = useRef<AbortController | null>();

    async function manualFetch(cursor?: SearchOperations['Body']['cursor']) {
        if (signal.current && !signal.current.signal.aborted) {
            signal.current.abort();
        }

        setLoading(true);
        const mySignal = new AbortController();
        mySignal.signal.throwIfAborted();
        signal.current = mySignal;
        try {
            let period = body.period;
            // Slide the window automatically when live
            // We do it only at query time so the URL stays shareable (datadog style)
            if (isLive && period) {
                const tmp = slidePeriod(period);
                period = { from: tmp.from!.toISOString(), to: tmp.to!.toISOString() };
            }

            const res = await apiFetch(`/api/v1/logs/operations?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({ ...body, period, cursor }),
                signal: mySignal.signal
            });
            if (res.status !== 200) {
                return { error: (await res.json()) as SearchOperations['Errors'] };
            }

            return { res: (await res.json()) as SearchOperations['Success'] };
        } catch (err) {
            if (err instanceof DOMException && err.ABORT_ERR) {
                return;
            }
            return { error: err };
        } finally {
            setLoading(false);
        }
    }

    async function fetchData(cursor?: SearchOperations['Body']['cursor']) {
        const man = await manualFetch(cursor);
        if (!man) {
            return;
        }
        if (man.error) {
            setData(undefined);
            setError((typeof man.error === 'string' || man.error instanceof Error ? { error: { message: man.error } } : man.error) as any);
            return;
        }

        setError(undefined);
        setData(man.res);
    }

    // We trigger manually to control live refresh, infinite scroll
    // useEffect(() => {
    //     if (enabled && !loading) {
    //         void fetchData();
    //     }
    // }, [enabled, env, body.limit, body.states, body.integrations, body.period, body.types, body.connections, body.syncs]);

    function trigger(cursor?: SearchOperations['Body']['cursor']) {
        void fetchData(cursor);
    }

    return { data, error, loading, trigger, manualFetch };
}

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

export function useSearchMessages(env: string, body: SearchMessages['Body']) {
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<SearchMessages['Success']>();
    const [error, setError] = useState<SearchMessages['Errors']>();
    const signal = useRef<AbortController | null>();

    async function manualFetch(opts: Pick<SearchMessages['Body'], 'cursorAfter' | 'cursorBefore'>) {
        if (signal.current && !signal.current.signal.aborted) {
            signal.current.abort();
        }

        setLoading(true);
        signal.current = new AbortController();
        try {
            const res = await apiFetch(`/api/v1/logs/messages?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({ ...body, ...opts }),
                signal: signal.current.signal
            });
            if (res.status !== 200) {
                return { error: (await res.json()) as SearchMessages['Errors'] };
            }

            return { res: (await res.json()) as SearchMessages['Success'] };
        } catch (err) {
            if (err instanceof DOMException && err.ABORT_ERR) {
                return;
            }
            return { error: err };
        } finally {
            setLoading(false);
        }
    }

    async function fetchData(opts: Pick<SearchMessages['Body'], 'cursorAfter' | 'cursorBefore'>) {
        const man = await manualFetch(opts);
        if (!man) {
            return;
        }
        if (man.error) {
            setData(undefined);
            setError(man.error as any);
            return;
        }

        setError(undefined);
        setData(man.res);
    }

    function trigger(opts: Pick<SearchMessages['Body'], 'cursorAfter' | 'cursorBefore'>) {
        if (!loading) {
            void fetchData(opts);
        }
    }

    return { data, error, loading, trigger, manualFetch };
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
