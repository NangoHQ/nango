import useSWR from 'swr';

import { apiFetch, swrFetcher } from '../utils/api';

import type { SWRError } from '../utils/api';
import type { DeleteIntegration, GetIntegration, GetIntegrationFlows, GetIntegrations, PatchIntegration, PostIntegration } from '@nangohq/types';
import type { Cache, useSWRConfig } from 'swr';

function integrationsPath(env: string) {
    return `/api/v1/integrations?env=${env}`;
}

export function useListIntegration(env: string) {
    const { data, error, mutate } = useSWR<GetIntegrations['Success'], SWRError<GetIntegrations['Errors']>>(integrationsPath(env), swrFetcher, {
        refreshInterval: 15000
    });

    const loading = !data && !error;

    return {
        loading,
        error,
        list: data?.data,
        mutate
    };
}

export function useGetIntegration(env: string, integrationId: string) {
    const { data, error, mutate } = useSWR<GetIntegration['Success'], SWRError<GetIntegration['Errors']>>(
        `/api/v1/integrations/${integrationId}?env=${env}`,
        swrFetcher
    );

    const loading = !data && !error;

    return {
        loading,
        error: error?.json,
        data: data?.data,
        mutate
    };
}

export async function apiPostIntegration(env: string, body: PostIntegration['Body']) {
    const res = await apiFetch(`/api/v1/integrations?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostIntegration['Reply']
    };
}

export async function apiPatchIntegration(env: string, integrationId: string, body: PatchIntegration['Body']) {
    const res = await apiFetch(`/api/v1/integrations/${integrationId}?env=${env}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PatchIntegration['Reply']
    };
}

export async function apiDeleteIntegration(env: string, integrationId: string) {
    const res = await apiFetch(`/api/v1/integrations/${integrationId}?env=${env}`, {
        method: 'DELETE'
    });

    return {
        res,
        json: (await res.json()) as DeleteIntegration['Reply']
    };
}

export function useGetIntegrationFlows(env: string, integrationId: string) {
    const { data, error, mutate } = useSWR<GetIntegrationFlows['Success'], SWRError<GetIntegrationFlows['Errors']>>(
        `/api/v1/integrations/${integrationId}/flows?env=${env}`,
        swrFetcher
    );

    const loading = !data && !error;

    return {
        loading,
        error: error?.json,
        data: data?.data,
        mutate
    };
}

export function clearIntegrationsCache(cache: Cache, mutate: ReturnType<typeof useSWRConfig>['mutate']) {
    for (const key of cache.keys()) {
        if (key.includes('/api/v1/integrations')) {
            void mutate(key, undefined);
        }
    }
}
