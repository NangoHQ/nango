import { toast } from 'react-toastify';
import { useSignout } from './user';
import type { AuthModes, RunSyncCommand, PreBuiltFlow } from '../types';

export async function fetcher(...args: Parameters<typeof fetch>) {
    const response = await fetch(...args);
    return response.json();
}

/**
 * Default SWR fetcher does not throw on HTTP error
 */
export async function swrFetcher<TBody>(url: string): Promise<TBody> {
    const res = await fetch(url);

    if (!res.ok) {
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

function getHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
}

export function useLogoutAPI() {
    return async () => {
        const options = {
            method: 'POST',
            headers: getHeaders()
        };

        await fetch('/api/v1/logout', options);
    };
}

export function useSignupAPI() {
    return async (name: string, email: string, password: string, account_id?: number, token?: string) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ name: name, email: email, password: password, account_id, token })
            };

            return fetch('/api/v1/signup', options);
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
                headers: getHeaders(),
                body: JSON.stringify({ email: email, password: password })
            };

            const res = await fetch('/api/v1/signin', options);

            if (res.status !== 200 && res.status !== 401) {
                return serverErrorToast();
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
            const res = await fetch('/api/v1/basic', { headers: getHeaders() });

            if (res.status !== 200 && res.status !== 401) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditCallbackUrlAPI(env: string) {
    const signout = useSignout();

    return async (callbackUrl: string) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ callback_url: callbackUrl })
            };

            const res = await fetch(`/api/v1/environment/callback?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditHmacEnabledAPI(env: string) {
    const signout = useSignout();

    return async (hmacEnabled: boolean) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ hmac_enabled: hmacEnabled })
            };

            const res = await fetch(`/api/v1/environment/hmac-enabled?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditAlwaysSendWebhookAPI(env: string) {
    const signout = useSignout();

    return async (alwaysSendWebhook: boolean) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ always_send_webhook: alwaysSendWebhook })
            };

            const res = await fetch(`/api/v1/environment/webhook-send?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditSendAuthWebhookAPI(env: string) {
    const signout = useSignout();

    return async (sendAuthWebhook: boolean) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ send_auth_webhook: sendAuthWebhook })
            };

            const res = await fetch(`/api/v1/environment/webhook-auth-send?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditHmacKeyAPI(env: string) {
    const signout = useSignout();

    return async (hmacKey: string) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ hmac_key: hmacKey })
            };

            const res = await fetch(`/api/v1/environment/hmac-key?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditEnvVariablesAPI(env: string) {
    const signout = useSignout();

    return async (envVariables: Record<string, string>[]) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(envVariables)
            };

            const res = await fetch(`/api/v1/environment/environment-variables?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditWebhookUrlAPI(env: string) {
    const signout = useSignout();

    return async (webhookUrl: string) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ webhook_url: webhookUrl })
            };

            const res = await fetch(`/api/v1/environment/webhook?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
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
            const res = await fetch(`/api/v1/integration?env=${env}`, { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetIntegrationDetailsAPI(env: string) {
    const signout = useSignout();

    return async (providerConfigKey: string) => {
        try {
            const res = await fetch(`/api/v1/integration/${encodeURIComponent(providerConfigKey)}?env=${env}&include_creds=true`, {
                headers: getHeaders()
            });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useCreateIntegrationAPI(env: string) {
    const signout = useSignout();

    return async (
        provider: string,
        authMode: AuthModes,
        providerConfigKey: string,
        clientId: string,
        clientSecret: string,
        scopes: string,
        app_link: string,
        custom?: Record<string, string>
    ) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    auth_mode: authMode,
                    provider: provider,
                    provider_config_key: providerConfigKey,
                    oauth_client_id: clientId,
                    oauth_client_secret: clientSecret,
                    oauth_scopes: scopes,
                    app_link,
                    custom
                })
            };

            const res = await fetch(`/api/v1/integration?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useCreateEmptyIntegrationAPI(env: string) {
    const signout = useSignout();

    return async (provider: string) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({
                    provider: provider
                })
            };

            const res = await fetch(`/api/v1/integration/new?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditIntegrationAPI(env: string) {
    const signout = useSignout();

    return async (
        provider: string,
        authMode: AuthModes,
        providerConfigKey: string,
        clientId: string,
        clientSecret: string,
        scopes: string,
        app_link: string,
        custom?: Record<string, string>
    ) => {
        try {
            const options = {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({
                    auth_mode: authMode,
                    provider: provider,
                    provider_config_key: providerConfigKey,
                    client_id: clientId,
                    client_secret: clientSecret,
                    scopes: scopes,
                    app_link,
                    custom
                })
            };

            const res = await fetch(`/api/v1/integration?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditIntegrationNameAPI(env: string) {
    const signout = useSignout();

    return async (providerConfigKey: string, name: string) => {
        try {
            const options = {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({
                    oldProviderConfigKey: providerConfigKey,
                    newProviderConfigKey: name
                })
            };

            const res = await fetch(`/api/v1/integration/name?env=${env}`, options);

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useDeleteIntegrationAPI(env: string) {
    const signout = useSignout();

    return async (providerConfigKey: string) => {
        try {
            const res = await fetch(`/api/v1/integration/${encodeURIComponent(providerConfigKey)}?env=${env}`, {
                headers: getHeaders(),
                method: 'DELETE'
            });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 204) {
                return serverErrorToast();
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
            const res = await fetch(`/api/v1/provider?env=${env}`, { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetConnectionListAPI(env: string) {
    const signout = useSignout();

    return async () => {
        try {
            const res = await fetch(`/api/v1/connection?env=${env}`, { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetConnectionDetailsAPI(env: string) {
    const signout = useSignout();

    return async (connectionId: string, providerConfigKey: string, force_refresh: boolean) => {
        try {
            const res = await fetch(
                `/api/v1/connection/${encodeURIComponent(connectionId)}?env=${env}&provider_config_key=${encodeURIComponent(
                    providerConfigKey
                )}&force_refresh=${force_refresh}`,
                {
                    headers: getHeaders()
                }
            );

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useDeleteConnectionAPI(env: string) {
    const signout = useSignout();

    return async (connectionId: string, providerConfigKey: string) => {
        try {
            const res = await fetch(
                `/api/v1/connection/${encodeURIComponent(connectionId)}?env=${env}&provider_config_key=${encodeURIComponent(providerConfigKey)}`,
                {
                    headers: getHeaders(),
                    method: 'DELETE'
                }
            );

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 204) {
                return serverErrorToast();
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
            const res = await fetch(`/api/v1/forgot-password`, {
                method: 'PUT',
                headers: getHeaders(),
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
            const res = await fetch(`/api/v1/reset-password`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ password: password, token: token })
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetSyncAPI(env: string) {
    return async (connectionId: string, providerConfigKey: string) => {
        try {
            const res = await fetch(`/api/v1/sync?env=${env}&connection_id=${connectionId}&provider_config_key=${providerConfigKey}`, {
                method: 'GET',
                headers: getHeaders()
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
            const res = await fetch(`/api/v1/environment/hmac?env=${env}&connection_id=${connectionId}&provider_config_key=${providerConfigKey}`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetAllSyncsAPI(env: string) {
    return async () => {
        try {
            const res = await fetch(`/api/v1/syncs?env=${env}`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useRunSyncAPI(env: string) {
    return async (command: RunSyncCommand, schedule_id: string, nango_connection_id: number, sync_id: string, sync_name: string, provider?: string) => {
        try {
            const res = await fetch(`/api/v1/sync/command?env=${env}`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ command, schedule_id, nango_connection_id, sync_id, sync_name, provider })
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetAccountAPI(env: string) {
    const signout = useSignout();

    return async () => {
        try {
            const res = await fetch(`/api/v1/account?env=${env}`, { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditAccountNameAPI(env: string) {
    const signout = useSignout();

    return async (name: string) => {
        try {
            const res = await fetch(`/api/v1/account?env=${env}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ name })
            });

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetUserAPI() {
    const signout = useSignout();

    return async () => {
        try {
            const res = await fetch('/api/v1/user', { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditUserNameAPI() {
    const signout = useSignout();

    return async (name: string) => {
        try {
            const res = await fetch('/api/v1/user/name', {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ name })
            });

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useEditUserPasswordAPI() {
    const signout = useSignout();

    return async (oldPassword: string, newPassword: string) => {
        try {
            const res = await fetch('/api/v1/user/password', {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ oldPassword, newPassword })
            });

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useInviteSignupAPI() {
    const signout = useSignout();

    return async (token: string) => {
        try {
            const res = await fetch(`/api/v1/signup/invite?token=${token}`, {
                method: 'GET',
                headers: getHeaders()
            });

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetFlows(env: string) {
    return async () => {
        try {
            const res = await fetch(`/api/v1/flows?env=${env}`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useCreateFlow(env: string) {
    return async (flow: PreBuiltFlow[]) => {
        try {
            const res = await fetch(`/api/v1/flow/deploy/pre-built?env=${env}`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(flow)
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetIntegrationEndpointsAPI(env: string) {
    return async (integration: string, provider: string) => {
        try {
            const res = await fetch(`/api/v1/integration/${integration}/endpoints?provider=${provider}&env=${env}`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetFlowDetailsAPI(env: string) {
    return async (providerConfigKey: string, flowName: string) => {
        try {
            const res = await fetch(`/api/v1/flow/${flowName}?provider_config_key=${providerConfigKey}&env=${env}`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useUpdateSyncFrequency(env: string) {
    return async (syncId: number, frequency: string) => {
        try {
            const res = await fetch(`/api/v1/sync/${syncId}/frequency?env=${env}`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ frequency })
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}

export function useGetConnectionAPI(env: string) {
    return async (providerConfigKey: string) => {
        try {
            const res = await fetch(`/api/v1/integration/${providerConfigKey}/connections?env=${env}`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch {
            requestErrorToast();
        }
    };
}
