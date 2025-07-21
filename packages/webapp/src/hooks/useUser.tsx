import useSWR from 'swr';

import { apiFetch, swrFetcher } from '../utils/api';

import type { SWRError } from '../utils/api';
import type { GetUser, PatchUser } from '@nangohq/types';
import type { SWRConfiguration } from 'swr';

export function useUser(enabled: boolean = true, options?: SWRConfiguration) {
    const { data, error, mutate, isLoading } = useSWR<GetUser['Success'], SWRError<GetUser['Errors']>>(enabled ? '/api/v1/user' : null, swrFetcher, options);

    const loading = !data && !error && isLoading;

    return {
        loading,
        error: error?.json,
        user: data?.data,
        mutate
    };
}

export async function apiPatchUser(body: PatchUser['Body']) {
    const res = await apiFetch('/api/v1/user', {
        method: 'PATCH',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PatchUser['Reply']
    };
}
