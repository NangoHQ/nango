import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APIError, apiFetch } from '@/utils/api';

import type { DeleteMFA, GetMFAStatus, PostMFAActivation, PostMFAEnrollment, PostMFARecoveryCodes } from '@nangohq/types';

export const mfaQueryKey = ['mfa'] as const;

async function fetchMFAStatus(): Promise<GetMFAStatus['Success']> {
    const res = await apiFetch('/api/v1/account/mfa');
    const json = (await res.json()) as GetMFAStatus['Reply'];
    if (!res.ok || 'error' in json) {
        throw new APIError({ res, json });
    }
    return json;
}

export function useMFA() {
    const queryClient = useQueryClient();
    const status = useQuery<GetMFAStatus['Success'], APIError>({ queryKey: mfaQueryKey, queryFn: fetchMFAStatus });
    const invalidateStatus = () => queryClient.invalidateQueries({ queryKey: mfaQueryKey });

    const enroll = useMutation<PostMFAEnrollment['Success'], APIError>({
        mutationFn: async () => {
            const res = await apiFetch('/api/v1/account/mfa/enroll', { method: 'POST' });
            const json = (await res.json()) as PostMFAEnrollment['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });

    const activate = useMutation<PostMFAActivation['Success'], APIError, { code: string }>({
        mutationFn: async (body) => {
            const res = await apiFetch('/api/v1/account/mfa/activate', { method: 'POST', body: JSON.stringify(body) });
            const json = (await res.json()) as PostMFAActivation['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: invalidateStatus
    });

    const regenerateRecoveryCodes = useMutation<PostMFARecoveryCodes['Success'], APIError, { code: string }>({
        mutationFn: async (body) => {
            const res = await apiFetch('/api/v1/account/mfa/recovery-codes', { method: 'POST', body: JSON.stringify(body) });
            const json = (await res.json()) as PostMFARecoveryCodes['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        }
    });

    const disable = useMutation<DeleteMFA['Success'], APIError, { code: string }>({
        mutationFn: async (body) => {
            const res = await apiFetch('/api/v1/account/mfa', { method: 'DELETE', body: JSON.stringify(body) });
            const json = (await res.json()) as DeleteMFA['Reply'];
            if (!res.ok || 'error' in json) {
                throw new APIError({ res, json });
            }
            return json;
        },
        onSuccess: invalidateStatus
    });

    return {
        enabled: status.data?.data.enabled,
        loading: status.isLoading,
        error: status.error,
        enroll,
        activate,
        regenerateRecoveryCodes,
        disable
    };
}
