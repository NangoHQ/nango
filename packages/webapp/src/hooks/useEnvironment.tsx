import useSWR from 'swr';
import { Account } from '../types';

export function useEnvironment() {
    const { data, error } = useSWR<{ account: Account }>('/api/v1/environment');

    const loading = !data && !error;

    return {
        loading,
        error,
        environment: data?.account
    };
}
