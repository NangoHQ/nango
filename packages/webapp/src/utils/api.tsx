import { toast } from 'react-toastify';
import { useSignout } from './user';

import type { PostSignup } from '@nangohq/types';

export async function apiFetch(input: string | URL | Request, init?: RequestInit) {
    return await fetch(input, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
        credentials: 'include' // For cookies
    });
}

export async function fetcher(...args: Parameters<typeof fetch>) {
    const response = await apiFetch(...args);
    return response.json();
}

export interface SWRError<TError> {
    json: TError;
    status: number;
}
/**
 * Default SWR fetcher does not throw on HTTP error
 */
export async function swrFetcher<TBody>(url: string, req?: RequestInit): Promise<TBody> {
    const res = await apiFetch(url, req);

    if (!res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/only-throw-error
        throw { json: await res.json(), status: res.status };
    }

    return await res.json();
}

export function requestErrorToast() {
    toast.error('Request error...', { position: toast.POSITION.BOTTOM_CENTER });
}

function serverErrorToast() {
    toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
}

export function useLogoutAPI() {
    return async () => {
        const options = {
            method: 'POST'
        };

        await apiFetch('/api/v1/account/logout', options);
    };
}

export function useSignupAPI() {
    return async (body: PostSignup['Body']) => {
        try {
            const options = {
                method: 'POST',
                body: JSON.stringify(body)
            };

            return await apiFetch('/api/v1/account/signup', options);
        } catch {
            requestErrorToast();
        }
    };
}

export function useSigninAPI() {
    return async (email: string, password: string) => {
        try {
            const options = {
                method: 'POST',
                body: JSON.stringify({ email: email, password: password })
            };

            const res = await apiFetch('/api/v1/account/signin', options);

            if (res.status !== 200 && res.status !== 401 && res.status !== 400) {
                serverErrorToast();
                return;
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useHostedSigninAPI() {
    return async () => {
        try {
            const res = await apiFetch('/api/v1/basic');

            if (res.status !== 200 && res.status !== 401) {
                serverErrorToast();
                return;
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetIntegrationListAPI(env: string) {
    const signout = useSignout();

    return async () => {
        try {
            const res = await apiFetch(`/api/v1/integrations?env=${env}`);

            if (res.status === 401) {
                await signout();
                return;
            }

            if (res.status !== 200) {
                serverErrorToast();
                return;
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetProvidersAPI(env: string) {
    const signout = useSignout();

    return async () => {
        try {
            const res = await apiFetch(`/api/v1/provider?env=${env}`);

            if (res.status === 401) {
                await signout();
                return;
            }

            if (res.status !== 200) {
                serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useRequestPasswordResetAPI() {
    return async (email: string) => {
        try {
            const res = await apiFetch(`/api/v1/account/forgot-password`, {
                method: 'POST',
                body: JSON.stringify({ email: email })
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useResetPasswordAPI() {
    return async (token: string, password: string) => {
        try {
            const res = await apiFetch(`/api/v1/account/reset-password`, {
                method: 'PUT',
                body: JSON.stringify({ password: password, token: token })
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetHmacAPI(env: string) {
    return async (providerConfigKey: string, connectionId: string) => {
        try {
            const res = await apiFetch(`/api/v1/environment/hmac?env=${env}&connection_id=${connectionId}&provider_config_key=${providerConfigKey}`, {
                method: 'GET'
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}
