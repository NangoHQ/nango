import useSWR from 'swr';
import type { Environment } from '../types';
import { swrFetcher } from '../utils/api';

export function useEnvironment(env: string) {
    const { data, error, mutate } = useSWR<{ environment: Environment }>(`/api/v1/environment?env=${env}`, swrFetcher, {});

    const loading = !data && !error;

    return {
        loading,
        error,
        environment: data?.environment,
        mutate
    };
}
