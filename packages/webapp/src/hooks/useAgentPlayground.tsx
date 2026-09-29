import { useMutation } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { PostAgentPlaygroundChat } from '@nangohq/types';

export function useAgentPlaygroundChat(env: string) {
    return useMutation<PostAgentPlaygroundChat['Success'], APIError, PostAgentPlaygroundChat['Body']>({
        mutationFn: async (body) => {
            const res = await apiFetch(`/api/v1/agent-playground/chat?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });

            const json = (await res.json()) as PostAgentPlaygroundChat['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }

            return json;
        }
    });
}
