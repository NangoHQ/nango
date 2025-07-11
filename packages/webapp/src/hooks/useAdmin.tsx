import { apiFetch } from '../utils/api';

import type { PostImpersonate } from '@nangohq/types';

export async function apiAdminImpersonate(env: string, body: PostImpersonate['Body']) {
    const res = await apiFetch(`/api/v1/admin/impersonate?env=${env}`, {
        method: 'POST',
        body: JSON.stringify(body)
    });

    return {
        res,
        json: (await res.json()) as PostImpersonate['Reply']
    };
}
