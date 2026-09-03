import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { RunSyncCommand } from '@/types';
import type { GetConnectionSyncs } from '@nangohq/types';

export const SYNCS_PAGE_SIZE = 50;

interface UseSyncsArgs {
    env: string;
    connection_id: string;
    provider_config_key: string;
    search?: string | undefined;
    limit?: number;
}

export function syncsQueryKey({ env, provider_config_key, connection_id }: Omit<UseSyncsArgs, 'search' | 'limit'>) {
    return ['syncs', env, provider_config_key, connection_id];
}

export function syncsPageQueryKey({ env, provider_config_key, connection_id, search, limit = SYNCS_PAGE_SIZE }: UseSyncsArgs) {
    return [...syncsQueryKey({ env, provider_config_key, connection_id }), { search, limit }];
}

async function fetchSyncs(connectionId: string, usp: URLSearchParams): Promise<GetConnectionSyncs['Success']> {
    const res = await apiFetch(`/api/v1/connections/${encodeURIComponent(connectionId)}/syncs?${usp.toString()}`, { method: 'GET' });

    const json = (await res.json()) as GetConnectionSyncs['Reply'];
    if (!res.ok || 'error' in json) {
        throw new APIError({ res, json });
    }

    return json;
}

export function useSyncs({ env, connection_id, provider_config_key, search, limit = SYNCS_PAGE_SIZE }: UseSyncsArgs) {
    return useInfiniteQuery<GetConnectionSyncs['Success'], APIError>({
        queryKey: syncsPageQueryKey({ env, connection_id, provider_config_key, search, limit }),
        queryFn: async ({ pageParam }) => {
            const usp = new URLSearchParams();
            usp.set('env', env);
            usp.set('provider_config_key', provider_config_key);
            usp.set('page', String(pageParam));
            usp.set('limit', String(limit));
            if (search?.trim()) {
                usp.set('search', search.trim());
            }

            return await fetchSyncs(connection_id, usp);
        },
        getNextPageParam: (lastPage) => {
            const { total, page, limit: pageLimit } = lastPage.pagination;
            return (page + 1) * pageLimit < total ? page + 1 : undefined;
        },
        initialPageParam: 0,
        enabled: Boolean(env && connection_id && provider_config_key),
        // Reusing rows keeps the search input from unmounting (and losing focus) on every keystroke,
        // but only within one connection — across connections the old rows would be acted on as if current.
        placeholderData: (previous, previousQuery) => {
            const previousScope = previousQuery?.queryKey.slice(0, 4);
            return previousScope && shallowEqual(previousScope, syncsQueryKey({ env, connection_id, provider_config_key })) ? previous : undefined;
        },
        // An infinite query's refetchInterval refetches every loaded page; the tab drives its own polling.
        refetchInterval: false,
        refetchOnWindowFocus: false
    });
}

export async function fetchSyncByName({
    env,
    connection_id,
    provider_config_key,
    name,
    variant = 'base'
}: {
    env: string;
    connection_id: string;
    provider_config_key: string;
    name: string;
    variant?: string;
}) {
    const usp = new URLSearchParams();
    usp.set('env', env);
    usp.set('provider_config_key', provider_config_key);
    usp.set('name', name);
    usp.set('variant', variant);
    usp.set('limit', '1');

    const json = await fetchSyncs(connection_id, usp);
    return json.data[0] ?? null;
}

export function useRunSyncCommand({ env, connection_id, provider_config_key }: Omit<UseSyncsArgs, 'search' | 'limit'>) {
    const queryClient = useQueryClient();
    return useMutation<
        { res: Response; json: Record<string, unknown> },
        APIError,
        {
            command: RunSyncCommand;
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

            return { res, json };
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: syncsQueryKey({ env, connection_id, provider_config_key }) });
        }
    });
}

function shallowEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
    return a.length === b.length && a.every((value, i) => value === b[i]);
}
