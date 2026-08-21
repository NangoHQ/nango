import { apiFetch } from '../utils/api';

import type { PostImpersonate } from '@nangohq/types';

export async function apiAdminImpersonate(env: string, body: PostImpersonate['Body'], signal?: AbortSignal) {
    const res = await apiFetch(`/api/v1/admin/impersonate?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body),
        signal
    });

    const json = (await res.json().catch(() => null)) as PostImpersonate['Reply'] | null;
    return { ok: res.status === 200, errorCode: json && 'error' in json ? json.error.code : undefined };
}
