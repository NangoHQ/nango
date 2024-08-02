import useSWR from 'swr';
import type { EnvironmentAndAccount } from '@nangohq/server';
import { swrFetcher } from '../utils/api';

export function useEnvironment(env: string) {
    const { data, error, mutate } = useSWR<{ environmentAndAccount: EnvironmentAndAccount }>(`/api/v1/environment?env=${env}`, swrFetcher, {});

    const loading = !data && !error;

    return {
        loading,
        error,
        environmentAndAccount: data?.environmentAndAccount,
        mutate
    };
}
