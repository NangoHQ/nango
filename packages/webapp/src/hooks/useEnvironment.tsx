import useSWR from 'swr';
import type { EnvironmentAndAccount } from '@nangohq/server';
import { apiFetch, swrFetcher } from '../utils/api';
import type { PostEnvironment } from '@nangohq/types';

export function useEnvironment(env: string) {
    const { data, error, mutate } = useSWR<{ environmentAndAccount: EnvironmentAndAccount }>(`/api/v1/environment?env=${env}`, swrFetcher, {});

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
