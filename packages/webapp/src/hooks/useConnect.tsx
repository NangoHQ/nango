import type { PostInternalConnectSessions } from '@nangohq/types';
import { apiFetch } from '../utils/api';

export async function apiConnectSessions(env: string) {
    const res = await apiFetch(`/api/v1/connect/sessions?env=${env}`, {
        method: 'POST'
    });

    return {
        res,
        json: (await res.json()) as PostInternalConnectSessions['Reply']
    };
}
