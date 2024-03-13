import useSWR from 'swr';
import type { GetMeta } from '@nangohq/server';

export function useMeta() {
    const { data, error } = useSWR<GetMeta>('/api/v1/meta');

    const loading = !data && !error;

    return {
        loading,
        error,
        meta: data
    };
}
