import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/utils/api';

import type { GetFlowSource } from '@nangohq/types';

export function useFlowSource(env: string, flowId: number | null | undefined) {
    return useQuery<string>({
        queryKey: ['flow-source', env, flowId],
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/flows/${flowId}/source?env=${env}`);
            if (!res.ok) {
                throw new Error('Failed to fetch flow source');
            }
            const json = (await res.json()) as GetFlowSource['Success'];
            return json.data.code;
        },
        enabled: Boolean(env && flowId)
    });
}
