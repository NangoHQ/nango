import useSWR from 'swr';

import { apiFetch, swrFetcher } from '../utils/api';

import type { GetEnvironment, PatchEnvironment, PatchWebhook, PostEnvironment, PostEnvironmentVariables } from '@nangohq/types';

export function useEnvironment(env: string) {
    const { data, error, mutate } = useSWR<GetEnvironment['Success'], GetEnvironment['Errors']>(`/api/v1/environments/current?env=${env}`, swrFetcher, {});

    const loading = !data && !error;

    return {
        loading,
        error,
        environmentAndAccount: data?.environmentAndAccount,
        mutate
    };
}

export async function apiPostEnvironment(body: PostEnvironment['Body']) {
    const res = await apiFetch('/api/v1/environments', {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostEnvironment['Reply']
    };
}

export async function apiPatchEnvironment(env: string, body: PatchEnvironment['Body']) {
    const res = await apiFetch(`/api/v1/environments?env=${env}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PatchEnvironment['Reply']
    };
}

export async function apiPatchWebhook(env: string, body: PatchWebhook['Body']) {
    const res = await apiFetch(`/api/v1/environments/webhook?env=${env}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostEnvironment['Reply']
    };
}

export async function apiPostVariables(env: string, body: PostEnvironmentVariables['Body']) {
    const res = await apiFetch(`/api/v1/environments/variables?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostEnvironmentVariables['Reply']
    };
}
