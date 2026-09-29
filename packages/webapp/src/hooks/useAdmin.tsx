import { useMutation } from '@tanstack/react-query';

import { APIError, apiFetch } from '../utils/api';

import type { PostImpersonate } from '@nangohq/types';

export function useAdminImpersonate(env: string) {
    return useMutation<PostImpersonate['Success'], APIError, { body: PostImpersonate['Body']; signal?: AbortSignal }>({
        mutationFn: async ({ body, signal }) => {
            const res = await apiFetch(`/api/v1/admin/impersonate?env=${env}`, {
                method: 'POST',
                body: JSON.stringify(body),
                signal
            });

            const json = (await res.json().catch(() => ({}))) as PostImpersonate['Reply'];
            if (res.status !== 200 || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });
}
