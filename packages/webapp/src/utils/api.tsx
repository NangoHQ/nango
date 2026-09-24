import { toast } from 'sonner';

import { globalEnv } from './env';

import type { ApiError } from '@nangohq/types';

export async function apiFetch(input: string | URL | Request, init?: RequestInit) {
    return await fetch(new URL(input as string, globalEnv.dashboardApiUrl), {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ? (init.headers as Record<string, string>) : {})
        },
        credentials: 'include' // For cookies
    });
}

export async function publicApiFetch(
    input: string | URL | Request,
    { connectionId, providerConfigKey, secretKey }: { connectionId: string; providerConfigKey: string; secretKey: string },
    init?: RequestInit
) {
    // Public API (e.g. /proxy), not dashboard admin. Keep this on apiUrl so split-host
    // self-hosted setups still hit the public host the SDK would use.
    return await fetch(new URL(input as string, globalEnv.apiUrl), {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ? (init.headers as Record<string, string>) : {}),
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey,
            Authorization: `Bearer ${secretKey}`
        }
    });
}

export function requestErrorToast() {
    toast.error('Request error...');
}

function serverErrorToast() {
    toast.error('Server error...');
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

export class APIError extends Error {
    json;
    res;
    constructor({ res, json }: { res: Response; json: Record<string, any> | ApiError<any> }) {
        super('api_error');
        this.json = json;
        this.res = res;
    }
}

// Only a missing session sends 401 `unauthorized`. Other 401s, like an unknown environment, come with a live session.
export function isNoSessionError(status: number, json: unknown): boolean {
    if (status !== 401 || typeof json !== 'object' || json === null || !('error' in json)) {
        return false;
    }
    const { error } = json;
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'unauthorized';
}
