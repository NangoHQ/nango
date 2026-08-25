import { useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { GetMeta } from '@nangohq/types';

export const metaQueryKey = ['meta'] as const;

export function useMeta(enabled: boolean = true) {
    return useQuery<GetMeta['Success'], APIError>({
        enabled,
        queryKey: metaQueryKey,
        queryFn: async (): Promise<GetMeta['Success']> => {
            const res = await apiFetch('/api/v1/meta', {
                method: 'GET'
            });

            const json = (await res.json()) as GetMeta['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}
