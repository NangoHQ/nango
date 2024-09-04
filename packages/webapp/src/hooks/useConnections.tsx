import useSWR from 'swr';
import type { ConnectionList } from '@nangohq/server';
import { apiFetch, swrFetcher } from '../utils/api';
import type { DeleteConnection } from '@nangohq/types';

export function useConnections(env: string) {
    const { data, error, mutate } = useSWR<{ connections: ConnectionList[] }>(`/api/v1/connection?env=${env}`, swrFetcher, {
        refreshInterval: 10000,
        keepPreviousData: false
    });

    const loading = !data && !error;

    const errorNotifications = data && data.connections ? data?.connections?.filter((connection) => connection.active_logs)?.length : 0;

    return {
        loading,
        error,
        data,
        mutate,
        errorNotifications
    };
}

export async function apiDeleteConnection(params: DeleteConnection['Params'], query: DeleteConnection['Querystring']) {
    const res = await apiFetch(`/api/v1/connection/${params.connectionId}?${new URLSearchParams(query).toString()}`, {
        method: 'DELETE'
    });

    return {
        res,
        json: (await res.json()) as DeleteConnection['Reply']
    };
}
