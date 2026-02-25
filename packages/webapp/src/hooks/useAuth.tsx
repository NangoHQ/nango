import { useMutation, useQuery } from '@tanstack/react-query';

import { APIError, apiFetch } from '@/utils/api';

import type {
    GetEmailByUuid,
    GetOnboardingHearAboutUs,
    PostForgotPassword,
    PostOnboardingHearAboutUs,
    PostSignin,
    PostSignup,
    PutResetPassword,
    ResendVerificationEmailByEmail,
    ResendVerificationEmailByUuid
} from '@nangohq/types';

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
    return useMutation<ResendVerificationEmailByEmail['Success'], APIError, { email: string }>({
        mutationFn: async ({ email }) => {
            const res = await apiFetch('/api/v1/account/resend-verification-email/by-email', {
                method: 'POST',
                body: JSON.stringify({ email })
            });

            if (res.status === 200) {
                return (await res.json()) as ResendVerificationEmailByEmail['Success'];
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        }
    });
}

export function useResendVerificationEmailByUuid() {
    return useMutation<ResendVerificationEmailByUuid['Success'], APIError, { uuid: string }>({
        mutationFn: async ({ uuid }) => {
            const res = await apiFetch('/api/v1/account/resend-verification-email/by-uuid', {
                method: 'POST',
                body: JSON.stringify({ uuid })
            });

            if (res.status === 200) {
                return (await res.json()) as ResendVerificationEmailByUuid['Success'];
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
        { name: string; email: string; password: string; token?: string }
    >({
        mutationFn: async ({ name, email, password, token }) => {
            const res = await apiFetch('/api/v1/account/signup', {
                method: 'POST',
                body: JSON.stringify({ name, email, password, token })
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

export function useRequestPasswordResetAPI() {
    return useMutation<
        | {
              status: 200;
              json: PostForgotPassword['Success'];
          }
        | {
              status: 400;
              json: PostForgotPassword['Errors'];
          },
        APIError,
        { email: string }
    >({
        mutationFn: async ({ email }) => {
            const res = await apiFetch('/api/v1/account/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email })
            });

            if (res.status === 200) {
                return {
                    status: res.status,
                    json: (await res.json()) as PostForgotPassword['Success']
                };
            }

            if (res.status === 400) {
                return {
                    status: res.status,
                    json: (await res.json()) as PostForgotPassword['Errors']
                };
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        }
    });
}

export function useResetPasswordAPI() {
    return useMutation<
        | {
              status: 200;
              json: PutResetPassword['Success'];
          }
        | {
              status: 400;
              json: PutResetPassword['Errors'];
          },
        APIError,
        { token: string; password: string }
    >({
        mutationFn: async ({ token, password }) => {
            const res = await apiFetch('/api/v1/account/reset-password', {
                method: 'PUT',
                body: JSON.stringify({ token, password })
            });

            if (res.status === 200) {
                return {
                    status: res.status,
                    json: (await res.json()) as PutResetPassword['Success']
                };
            }

            if (res.status === 400) {
                return {
                    status: res.status,
                    json: (await res.json()) as PutResetPassword['Errors']
                };
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        }
    });
}

export function useEmailByUuid(uuid: string | undefined) {
    return useQuery<GetEmailByUuid['Success'], APIError>({
        queryKey: ['account', 'email', uuid],
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/account/email/${uuid}`);

            if (res.status === 200) {
                return (await res.json()) as GetEmailByUuid['Success'];
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        },
        enabled: !!uuid
    });
}

export function useOnboardingHearAboutUs() {
    return useQuery<GetOnboardingHearAboutUs['Success'], APIError>({
        queryKey: ['account', 'onboarding', 'hear-about-us'],
        queryFn: async () => {
            const res = await apiFetch('/api/v1/account/onboarding/hear-about-us');

            if (res.status === 200) {
                return (await res.json()) as GetOnboardingHearAboutUs['Success'];
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        }
    });
}

export function usePostOnboardingHearAboutUs() {
    return useMutation<
        | {
              status: 200;
              json: PostOnboardingHearAboutUs['Success'];
          }
        | {
              status: 401 | 403;
              json: PostOnboardingHearAboutUs['Errors'];
          },
        APIError,
        { source: PostOnboardingHearAboutUs['Body']['source'] }
    >({
        mutationFn: async ({ source }) => {
            const res = await apiFetch('/api/v1/account/onboarding/hear-about-us', {
                method: 'POST',
                body: JSON.stringify({ source })
            });

            if (res.status === 200) {
                return {
                    status: res.status,
                    json: (await res.json()) as PostOnboardingHearAboutUs['Success']
                };
            }

            if (res.status === 401 || res.status === 403) {
                return {
                    status: res.status,
                    json: (await res.json()) as PostOnboardingHearAboutUs['Errors']
                };
            }

            const json = (await res.json()) as Record<string, unknown>;
            throw new APIError({ res, json });
        }
    });
}
