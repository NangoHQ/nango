import { useMutation } from '@tanstack/react-query';

import { APIError, apiFetch } from '@/utils/api';

export function useSigninAPI() {
    return useMutation<Response, APIError, { email: string; password: string }>({
        mutationFn: async ({ email, password }) => {
            const res = await apiFetch('/api/v1/account/signin', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (res.status === 200 || res.status === 401 || res.status === 400) {
                return res;
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        }
    });
}

export function useResendVerificationEmail() {
    return useMutation<Response, APIError, { email: string }>({
        mutationFn: async ({ email }) => {
            const res = await apiFetch('/api/v1/account/resend-verification-email/by-email', {
                method: 'POST',
                body: JSON.stringify({ email })
            });

            if (res.status === 200) {
                return res;
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        }
    });
}
