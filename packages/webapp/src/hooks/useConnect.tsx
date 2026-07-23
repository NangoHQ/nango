import { apiFetch } from '../utils/api';

import type { PostInternalConnectSessions, PostInternalConnectSessionsReconnect } from '@nangohq/types';

export async function apiConnectSessions(env: string, body: PostInternalConnectSessions['Body']) {
    const res = await apiFetch(`/api/v1/connect/sessions?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostInternalConnectSessions['Reply']
    };
}

export async function apiConnectSessionsReconnect(env: string, body: PostInternalConnectSessionsReconnect['Body']) {
    const res = await apiFetch(`/api/v1/connect/sessions/reconnect?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostInternalConnectSessionsReconnect['Reply']
    };
}
