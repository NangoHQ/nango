import useSWR from 'swr';
import { User } from '../types';

export function useUser() {
    const { data, error, mutate } = useSWR<{ user: User }>('/api/v1/user');

    const loading = !data && !error;

    return {
        loading,
        user: data?.user,
        mutate
    };
}
