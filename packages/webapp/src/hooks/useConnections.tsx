import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import type { SWRError } from '../utils/api';
import { apiFetch, swrFetcher } from '../utils/api';
import type { GetConnections, DeleteConnection, GetConnectionsCount } from '@nangohq/types';
import { useMemo } from 'react';

export function useConnections(queries: GetConnections['Querystring']) {
    const { data, error, size, setSize, mutate } = useSWRInfinite<GetConnections['Success'], SWRError<GetConnections['Errors']>>(
        (offset, previousPageData: GetConnections['Success'] | null) => {
            if (previousPageData && previousPageData.data.length <= 0) {
                return null; // reached the end
            }

            const usp = new URLSearchParams(queries as any);
            if (queries.integrationIds?.length === 1 && queries.integrationIds[0] === 'all') {
                usp.delete('integrationIds');
            }
            usp.forEach((value, key) => {
                if (value === 'undefined') {
                    usp.delete(key);
                }
            });
            usp.set('page', String(offset));
            return `/api/v1/connections?${usp.toString()}`;
        },
        swrFetcher,
        { revalidateFirstPage: false }
    );

    const hasNext = useMemo(() => {
        if (!data) return false;
        return data[data.length - 1].data.length >= 20;
    }, [data]);

    const loading = !data && !error;

    return { loading, error: error?.json, data, hasNext, offset: size, setOffset: setSize, mutate };
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

export async function apiDeleteConnection(params: DeleteConnection['Params'], query: DeleteConnection['Querystring']) {
    const res = await apiFetch(`/api/v1/connections/${params.connectionId}?${new URLSearchParams(query).toString()}`, {
        method: 'DELETE'
    });

    return {
        res,
        json: (await res.json()) as DeleteConnection['Reply']
    };
}
