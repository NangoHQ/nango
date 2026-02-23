import { useMutation } from '@tanstack/react-query';

import { APIError, apiFetch } from '@/utils/api';

import type { PostSignin, PostSignup } from '@nangohq/types';

export function useSigninAPI() {
    return useMutation<
        | {
              status: 200;
              json: PostSignin['Success'];
          }
        | {
              status: 401 | 400;
              json: PostSignin['Errors'];
          },
        APIError,
        { email: string; password: string }
    >({
        mutationFn: async ({ email, password }) => {
            const res = await apiFetch('/api/v1/account/signin', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            if (res.status === 200) {
                return {
                    status: res.status,
                    json: (await res.json()) as PostSignin['Success']
                };
            }

            if (res.status === 401 || res.status === 400) {
                return {
                    status: res.status,
                    json: (await res.json()) as PostSignin['Errors']
                };
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

export function useSignupAPI() {
    return useMutation<
        | {
              status: 200;
              json: PostSignup['Success'];
          }
        | {
              status: 400;
              json: PostSignup['Errors'];
          },
        APIError,
        { name: string; email: string; password: string }
    >({
        mutationFn: async ({ name, email, password }) => {
            const res = await apiFetch('/api/v1/account/signup', {
                method: 'POST',
                body: JSON.stringify({ name, email, password })
            });

            if (res.status === 200) {
                return {
                    status: res.status,
                    json: (await res.json()) as PostSignup['Success']
                };
            }

            if (res.status === 400) {
                return {
                    status: res.status,
                    json: (await res.json()) as PostSignup['Errors']
                };
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        }
    });
}
