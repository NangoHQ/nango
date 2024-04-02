import useSWR from 'swr';
import { swrFetcher } from '../utils/api';
import type { GetUser } from '@nangohq/server';

export function useUser(enabled: boolean = true) {
    const { data, error, mutate } = useSWR<GetUser>(enabled ? '/api/v1/user' : null, swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        user: data?.user,
        mutate
    };
}
