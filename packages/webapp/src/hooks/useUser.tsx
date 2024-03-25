import useSWR from 'swr';
import type { User } from '../types';
import { swrFetcher } from '../utils/api';

export function useUser() {
    const { data, error, mutate } = useSWR<{ user: User }>('/api/v1/user', swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        user: data?.user,
        mutate
    };
}
