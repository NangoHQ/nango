import type { SWRConfiguration } from 'swr';
import useSWR from 'swr';
import type { SWRError } from '../utils/api';
import { apiFetch, swrFetcher } from '../utils/api';
import type { GetUser, PatchUser } from '@nangohq/types';

export function useUser(enabled: boolean = true, options?: SWRConfiguration) {
    const { data, error, mutate } = useSWR<GetUser['Success'], SWRError<GetUser['Errors']>>(enabled ? '/api/v1/user' : null, swrFetcher, options);

    const loading = !data && !error;

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
