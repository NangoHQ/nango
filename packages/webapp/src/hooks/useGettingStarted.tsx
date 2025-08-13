import useSWR from 'swr';

import { apiFetch, swrFetcher } from '../utils/api';

import type { SWRError } from '../utils/api';
import type { GetGettingStarted, PatchGettingStarted } from '@nangohq/types';

export function useGettingStarted(env: string) {
    const { data, error, mutate, isLoading } = useSWR<GetGettingStarted['Success'], SWRError<GetGettingStarted['Errors']>>(
        `/api/v1/getting-started?env=${env}`,
        swrFetcher,
        {
            revalidateIfStale: true
        }
    );

    return {
        data,
        isLoading,
        error,
        mutate
    };
}

export async function patchGettingStarted(env: string, body: PatchGettingStarted['Body']) {
    const res = await apiFetch(`/api/v1/getting-started?env=${env}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res
    };
}
