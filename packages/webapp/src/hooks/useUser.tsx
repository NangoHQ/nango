import useSWR from 'swr';
import { swrFetcher } from '../utils/api';
import type { GetUser } from '@nangohq/server';

export function useUser() {
    const { data, error, mutate } = useSWR<GetUser>('/api/v1/user', swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        user: data?.user,
        mutate
    };
}
