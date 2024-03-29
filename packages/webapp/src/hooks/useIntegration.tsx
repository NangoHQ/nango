import useSWR from 'swr';
import type { ListIntegration } from '@nangohq/server';
import { swrFetcher } from '../utils/api';

export function useListIntegration(env: string) {
    const { data, error, mutate } = useSWR<ListIntegration>(`/api/v1/integration?env=${env}`, swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        list: data,
        mutate
    };
}
