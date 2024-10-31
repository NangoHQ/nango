import useSWR from 'swr';
import { swrFetcher } from '../utils/api';
import type { SyncResponse } from '../types';

export function useSyncs(queries: { env: string; connection_id: string; provider_config_key: string }) {
    const { data, error, mutate } = useSWR<SyncResponse[]>(
        `/api/v1/sync?env=${queries.env}&connection_id=${encodeURIComponent(queries.connection_id)}&provider_config_key=${encodeURIComponent(queries.provider_config_key)}`,
        swrFetcher
    );

    const loading = !data && !error;

    return { loading, error: error?.json, data: data, mutate };
}
