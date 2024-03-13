import useSWR from 'swr';
import { Account } from '../types';
import { swrFetcher } from '../utils/api';

export function useEnvironment() {
    const { data, error } = useSWR<{ account: Account }>('/api/v1/environment', swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        environment: data?.account
    };
}
