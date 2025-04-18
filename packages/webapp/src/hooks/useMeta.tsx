import useSWR from 'swr';
import type { SWRError } from '../utils/api';
import { swrFetcher } from '../utils/api';
import type { GetMeta } from '@nangohq/types';

export function useMeta() {
    const { data, error, mutate } = useSWR<GetMeta['Success'], SWRError<GetMeta['Errors']>>('/api/v1/meta', swrFetcher);

    const loading = !data && !error;

    return {
        loading,
        error,
        meta: data?.data,
        mutate
    };
}
