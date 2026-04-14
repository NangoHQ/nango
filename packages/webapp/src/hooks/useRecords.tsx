import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetConnectionRecordModels, GetConnectionRecords, NangoRecord } from '@nangohq/types';

export function useConnectionRecordModels(queries: GetConnectionRecordModels['Querystring'], params: GetConnectionRecordModels['Params']) {
    return useQuery<GetConnectionRecordModels['Success']['data'], APIError>({
        queryKey: ['connection-record-models', params.connectionId, queries.env, queries.provider_config_key],
        queryFn: async () => {
            const searchParams = new URLSearchParams({
                env: queries.env,
                provider_config_key: queries.provider_config_key
            });

            const res = await apiFetch(`/api/v1/connections/${encodeURIComponent(params.connectionId)}/records/models?${searchParams.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetConnectionRecordModels['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json.data;
        },
        enabled: Boolean(queries.env && queries.provider_config_key && params.connectionId)
    });
}

export function useConnectionRecords(queries: GetConnectionRecords['Querystring'], params: GetConnectionRecords['Params']) {
    return useInfiniteQuery<GetConnectionRecords['Success']['data'], APIError>({
        queryKey: [
            'connection-records',
            params.connectionId,
            queries.env,
            queries.provider_config_key,
            queries.model,
            queries.variant,
            queries.limit,
            queries.metadata_only
        ],
        queryFn: async ({ pageParam }) => {
            const searchParams = new URLSearchParams({
                env: queries.env,
                provider_config_key: queries.provider_config_key,
                model: queries.model
            });

            if (queries.variant) {
                searchParams.set('variant', queries.variant);
            }
            if (queries.limit) {
                searchParams.set('limit', String(queries.limit));
            }
            if (queries.metadata_only) {
                searchParams.set('metadata_only', 'true');
            }
            if (typeof pageParam === 'string') {
                searchParams.set('cursor', pageParam);
            }

            const res = await apiFetch(`/api/v1/connections/${encodeURIComponent(params.connectionId)}/records?${searchParams.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetConnectionRecords['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json.data;
        },
        getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
        initialPageParam: undefined as string | undefined,
        enabled: Boolean(queries.env && queries.provider_config_key && queries.model && params.connectionId)
    });
}

export function useConnectionRecordPayload(
    queries: {
        env: string;
        provider_config_key: string;
        model: string;
        variant?: string | undefined;
        record_id: string;
    },
    params: GetConnectionRecords['Params'],
    options: { enabled: boolean }
) {
    return useQuery<NangoRecord, APIError>({
        queryKey: [
            'connection-record-payload',
            params.connectionId,
            queries.env,
            queries.provider_config_key,
            queries.model,
            queries.variant,
            queries.record_id
        ],
        queryFn: async () => {
            const searchParams = new URLSearchParams({
                env: queries.env,
                provider_config_key: queries.provider_config_key,
                model: queries.model,
                record_id: queries.record_id
            });

            if (queries.variant) {
                searchParams.set('variant', queries.variant);
            }

            const res = await apiFetch(`/api/v1/connections/${encodeURIComponent(params.connectionId)}/records?${searchParams.toString()}`, {
                method: 'GET'
            });

            const json = (await res.json()) as GetConnectionRecords['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            const rec = json.data.records[0];
            if (!rec) {
                throw new APIError({
                    res,
                    json: { error: { code: 'not_found', message: 'Record not found' } }
                });
            }

            return rec;
        },
        enabled: options.enabled && Boolean(queries.env && queries.provider_config_key && queries.model && queries.record_id && params.connectionId),
        staleTime: 60_000,
        gcTime: 60_000
    });
}
