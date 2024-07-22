import useSWR from 'swr';
import { swrFetcher } from '../utils/api';
import type { GetMeta } from '@nangohq/types';

export function useMeta() {
    const { data, error } = useSWR<GetMeta['Success'], GetMeta['Errors']>('/api/v1/meta', swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        meta: data?.data
    };
}
