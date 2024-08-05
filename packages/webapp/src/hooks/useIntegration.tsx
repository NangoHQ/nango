import useSWR from 'swr';
import type { ListIntegration } from '@nangohq/server';
import type { SWRError } from '../utils/api';
import { apiFetch, swrFetcher } from '../utils/api';
import type { DeleteIntegration, GetIntegration, PatchIntegration, PostIntegration } from '@nangohq/types';

export function useListIntegration(env: string) {
    const { data, error, mutate } = useSWR<ListIntegration>(`/api/v1/integration?env=${env}`, swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        list: data,
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
