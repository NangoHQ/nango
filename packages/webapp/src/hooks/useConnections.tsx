import useSWR from 'swr';
import type { ConnectionList } from '@nangohq/server';
import { swrFetcher } from '../utils/api';

export function useConnections(env: string) {
    const { data, error, mutate } = useSWR<{ connections: ConnectionList[] }>(`/api/v1/connection?env=${env}`, swrFetcher, {
        refreshInterval: 10000,
        keepPreviousData: false
    });

    const loading = !data && !error;

    const errorNotifications = data && data.connections ? data?.connections?.filter((connection) => connection.error_log_id)?.length : 0;

    return {
        loading,
        error,
        data,
        mutate,
        errorNotifications
    };
}
