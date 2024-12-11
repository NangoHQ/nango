import useSWR from 'swr';
import { apiFetch, swrFetcher } from '../utils/api';
import type { RunSyncCommand, SyncResponse } from '../types';

export function useSyncs(queries: { env: string; connection_id: string; provider_config_key: string }) {
    const { data, error, mutate } = useSWR<SyncResponse[]>(
        `/api/v1/sync?env=${queries.env}&connection_id=${encodeURIComponent(queries.connection_id)}&provider_config_key=${encodeURIComponent(queries.provider_config_key)}`,
        swrFetcher
    );

    const loading = !data && !error;

    return { loading, error: error?.json, data: data, mutate };
}

export async function apiRunSyncCommand(
    env: string,
    body: {
        command: RunSyncCommand;
        schedule_id: string;
        nango_connection_id: number;
        sync_id: string;
        sync_name: string;
        provider: string;
        delete_records?: boolean;
    }
) {
    const res = await apiFetch(`/api/v1/sync/command?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: await res.json()
    };
}
