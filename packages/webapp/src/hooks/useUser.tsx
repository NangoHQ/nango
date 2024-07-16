import useSWR from 'swr';
import { apiFetch, requestErrorToast, swrFetcher } from '../utils/api';
import type { GetUser, PatchUser } from '@nangohq/types';

export function useUser(enabled: boolean = true) {
    const { data, error, mutate } = useSWR<GetUser['Success'], GetUser['Errors']>(enabled ? '/api/v1/user' : null, swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        user: data?.data,
        mutate
    };
}

export async function apiPatchUser(body: PatchUser['Body']) {
    try {
        const res = await apiFetch('/api/v1/user', {
            method: 'PATCH',
            body: JSON.stringify(body)
        });

        return {
            res,
            json: (await res.json()) as PatchUser['Reply']
        };
    } catch {
        requestErrorToast();
    }
}
