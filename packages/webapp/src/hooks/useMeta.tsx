import useSWR from 'swr';
import type { GetMeta } from '@nangohq/server';
import { swrFetcher } from '../utils/api';

export function useMeta() {
    const { data, error } = useSWR<GetMeta>('/api/v1/meta', swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        meta: data
    };
}
