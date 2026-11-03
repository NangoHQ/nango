import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';
import { metaQueryKey } from './useMeta';

import type { GetAgentGettingStarted, PostAgentGettingStartedDismiss, PostAgentGettingStartedRestart } from '@nangohq/types';

const agentGettingStartedQueryKey = ['agent-getting-started'] as const;

// Progress comes from the user's own agent, so the page polls to tick the checklist while they work there.
const POLL_INTERVAL_MS = 5000;

export function useAgentGettingStarted() {
    return useQuery<GetAgentGettingStarted['Success'], APIError>({
        queryKey: agentGettingStartedQueryKey,
        queryFn: async () => {
            const res = await apiFetch('/api/v1/agent-getting-started');
            const json = (await res.json()) as GetAgentGettingStarted['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        refetchInterval: POLL_INTERVAL_MS
    });
}

export function useRestartAgentGettingStarted() {
    const queryClient = useQueryClient();
    return useMutation<PostAgentGettingStartedRestart['Success'], APIError>({
        mutationFn: async () => {
            const res = await apiFetch('/api/v1/agent-getting-started/restart', { method: 'POST' });
            const json = (await res.json()) as PostAgentGettingStartedRestart['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: (data) => {
            queryClient.setQueryData(agentGettingStartedQueryKey, data);
        }
    });
}

export function useDismissAgentGettingStarted() {
    const queryClient = useQueryClient();
    return useMutation<PostAgentGettingStartedDismiss['Success'], APIError>({
        mutationFn: async () => {
            const res = await apiFetch('/api/v1/agent-getting-started/dismiss', { method: 'POST' });
            const json = (await res.json()) as PostAgentGettingStartedDismiss['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: async (data) => {
            queryClient.setQueryData(agentGettingStartedQueryKey, data);
            await queryClient.invalidateQueries({ queryKey: metaQueryKey });
        }
    });
}
