import { useMutation } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { PostInternalConnectSessions } from '@nangohq/types';

export async function postConnectSession(env: string, body: PostInternalConnectSessions['Body']): Promise<PostInternalConnectSessions['Success']> {
    const res = await apiFetch(`/api/v1/connect/sessions?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    const json = (await res.json()) as PostInternalConnectSessions['Reply'];
    if (!res.ok || 'error' in json) {
        throw new APIError({ res, json });
    }
    return json;
}

export function useCreateConnectSession(env: string) {
    return useMutation<PostInternalConnectSessions['Success'], APIError, PostInternalConnectSessions['Body']>({
        mutationFn: (body) => postConnectSession(env, body)
    });
}
