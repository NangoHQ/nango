import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { RunSyncCommand, SyncResponse } from '../types.js';

export function useSyncs(queries: { env: string; connection_id: string; provider_config_key: string }) {
    return useQuery<SyncResponse[], APIError>({
        enabled: Boolean(queries.env && queries.connection_id && queries.provider_config_key),
        queryKey: ['syncs', queries.env, queries.connection_id, queries.provider_config_key],
        queryFn: async () => {
            const res = await apiFetch(
                `/api/v1/sync?env=${queries.env}&connection_id=${encodeURIComponent(queries.connection_id)}&provider_config_key=${encodeURIComponent(queries.provider_config_key)}`
            );

            const json = (await res.json()) as SyncResponse[];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        },
        refetchInterval: 5000 // 5 seconds
    });
}

export function useRunSyncCommand(env: string) {
    const queryClient = useQueryClient();
    return useMutation<
        { res: Response; json: Record<string, unknown> },
        APIError,
        {
            command: RunSyncCommand;
            schedule_id: string;
            nango_connection_id: number;
            sync_id: string;
            sync_name: string;
            sync_variant: string;
            provider: string;
            delete_records?: boolean;
        }
    >({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/sync/command?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as Record<string, unknown>;
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return {
                res,
                json
            };
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['syncs'] });
        }
    });
}
