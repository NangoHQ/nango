import { toast } from 'react-toastify';
import { useSignout } from './user';
import { AuthModes, RunSyncCommand, PreBuiltFlow } from '../types';


function requestErrorToast() {
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
        } catch (e) {
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

            let res = await fetch('/api/v1/signin', options);

            if (res.status !== 200 && res.status !== 401) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useHostedSigninAPI() {
    return async () => {
        try {
            let res = await fetch('/api/v1/basic', { headers: getHeaders() });

            if (res.status !== 200 && res.status !== 401) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetProjectInfoAPI() {
    const signout = useSignout();

    return async () => {
        try {
            let res = await fetch('/api/v1/environment', { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditCallbackUrlAPI() {
    const signout = useSignout();

    return async (callbackUrl: string) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ callback_url: callbackUrl })
            };

            let res = await fetch('/api/v1/environment/callback', options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditHmacEnabledAPI() {
    const signout = useSignout();

    return async (hmacEnabled: boolean) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ hmac_enabled: hmacEnabled })
            };

            let res = await fetch('/api/v1/environment/hmac-enabled', options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditAlwaysSendWebhookAPI() {
    const signout = useSignout();

    return async (alwaysSendWebhook: boolean) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ always_send_webhook: alwaysSendWebhook })
            };

            let res = await fetch('/api/v1/environment/webhook-send', options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditSendAuthWebhookAPI() {
    const signout = useSignout();

    return async (sendAuthWebhook: boolean) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ send_auth_webhook: sendAuthWebhook })
            };

            let res = await fetch('/api/v1/environment/webhook-auth-send', options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditHmacKeyAPI() {
    const signout = useSignout();

    return async (hmacKey: string) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ hmac_key: hmacKey })
            };

            let res = await fetch('/api/v1/environment/hmac-key', options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditEnvVariablesAPI() {
    const signout = useSignout();

    return async (envVariables: Array<Record<string, string>>) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(envVariables)
            };

            let res = await fetch('/api/v1/environment/environment-variables', options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditWebhookUrlAPI() {
    const signout = useSignout();

    return async (webhookUrl: string) => {
        try {
            const options = {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ webhook_url: webhookUrl })
            };

            let res = await fetch('/api/v1/environment/webhook', options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetIntegrationListAPI() {
    const signout = useSignout();

    return async () => {
        try {
            let res = await fetch('/api/v1/integration', { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetIntegrationDetailsAPI() {
    const signout = useSignout();

    return async (providerConfigKey: string) => {
        try {
            let res = await fetch(`/api/v1/integration/${encodeURIComponent(providerConfigKey)}?include_creds=true`, {
                headers: getHeaders()
            });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useCreateIntegrationAPI() {
    const signout = useSignout();

    return async (provider: string, authMode: AuthModes, providerConfigKey: string, clientId: string, clientSecret: string, scopes: string, app_link: string, custom?: Record<string, string>) => {
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

            let res = await fetch('/api/v1/integration', options);

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useCreateEmptyIntegrationAPI() {
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

            let res = await fetch('/api/v1/integration/new', options);

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditIntegrationAPI() {
    const signout = useSignout();

    return async (provider: string, authMode: AuthModes, providerConfigKey: string, clientId: string, clientSecret: string, scopes: string, app_link: string, custom?: Record<string, string>) => {
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

            let res = await fetch('/api/v1/integration', options);

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditIntegrationNameAPI() {
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

            const res = await fetch(`/api/v1/integration/name`, options);

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useDeleteIntegrationAPI() {
    const signout = useSignout();

    return async (providerConfigKey: string) => {
        try {
            let res = await fetch(`/api/v1/integration/${encodeURIComponent(providerConfigKey)}`, {
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
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetProvidersAPI() {
    const signout = useSignout();

    return async () => {
        try {
            let res = await fetch('/api/v1/provider', { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetConnectionListAPI() {
    const signout = useSignout();

    return async (limit: number, offset: number, integration?: string) => {
        try {
            const res = await fetch(
                `/api/v1/connection?limit=${limit}&offset=${offset}` +
                    `${integration ? `&integration=${integration}` : ''}`,
                {
                    method: 'GET',
                    headers: getHeaders()
                }
            );

            if (res.status === 401) {
                return signout();
            }

            if (res.status !== 200) {
                return serverErrorToast();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetConnectionDetailsAPI() {
    const signout = useSignout();

    return async (connectionId: string, providerConfigKey: string, force_refresh: boolean) => {
        try {
            let res = await fetch(
                `/api/v1/connection/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(
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
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useDeleteConnectionAPI() {
    const signout = useSignout();

    return async (connectionId: string, providerConfigKey: string) => {
        try {
            const res = await fetch(`/api/v1/connection/${encodeURIComponent(connectionId)}?provider_config_key=${encodeURIComponent(providerConfigKey)}`, {
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
        } catch (e) {
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
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useResetPasswordAPI() {
    return async (token: string, password: string) => {
        try {
            let res = await fetch(`/api/v1/reset-password`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ password: password, token: token })
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useActivityAPI() {
    return async (limit: number, offset: number, status?: string, script?: string, integration?: string, connection?: string, date?: string) => {
        try {
            const res = await fetch(
              `/api/v1/activity?limit=${limit}&offset=${offset}` +
              `${status ? `&status=${status}` : ''}` +
              `${script ? `&script=${script}` : ''}` +
              `${integration ? `&integration=${integration}` : ''}` +
              `${connection ? `&connection=${connection}` : ''}` +
              `${date ? `&date=${date}` : ''}`, {
              method: 'GET',
              headers: getHeaders(),
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetSyncAPI() {
    return async (connectionId: string, providerConfigKey: string) => {
        try {
            const res = await fetch(`/api/v1/sync?connection_id=${connectionId}&provider_config_key=${providerConfigKey}`, {
                method: 'GET',
                headers: getHeaders(),
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetHmacAPI() {
    return async (providerConfigKey: string, connectionId: string) => {
        try {
            const res = await fetch(`/api/v1/environment/hmac?connection_id=${connectionId}&provider_config_key=${providerConfigKey}`, {
                method: 'GET',
                headers: getHeaders(),
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetAllSyncsAPI() {
    return async () => {
        try {
            const res = await fetch(`/api/v1/syncs`, {
                method: 'GET',
                headers: getHeaders(),
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useRunSyncAPI() {
    return async (command: RunSyncCommand, schedule_id: string, nango_connection_id: number, sync_id: string, sync_name: string, provider?: string) => {
        try {
            const res = await fetch(`/api/v1/sync/command`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ command, schedule_id, nango_connection_id, sync_id, sync_name, provider })
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }

    };
}

export function useGetAccountAPI() {
    const signout = useSignout();

    return async () => {
        try {
            const res = await fetch('/api/v1/account', { headers: getHeaders() });

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useEditAccountNameAPI() {
    const signout = useSignout();

    return async (name: string) => {
        try {
            const res = await fetch('/api/v1/account', {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ name })
            });

            if (res.status === 401) {
                return signout();
            }

            return res;
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetFlows() {
    return async () => {
        try {
            const res = await fetch(`/api/v1/flows`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useCreateFlow() {
    return async (flow: PreBuiltFlow[]) => {
        try {
            const res = await fetch(`/api/v1/flow/deploy/pre-built`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(flow)
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetIntegrationEndpointsAPI() {
    return async (integration: string, provider: string) => {
        try {
            const res = await fetch(`/api/v1/integration/${integration}/endpoints?provider=${provider}`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useGetFlowDetailsAPI() {
    return async (providerConfigKey: string, flowName: string) => {
        try {
            const res = await fetch(`/api/v1/flow/${flowName}?provider_config_key=${providerConfigKey}`, {
                method: 'GET',
                headers: getHeaders()
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}

export function useUpdateSyncFrequency() {
    return async (syncId: number, frequency: string) => {
        try {
            const res = await fetch(`/api/v1/sync/${syncId}/frequency`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ frequency })
            });

            return res;
        } catch (e) {
            requestErrorToast();
        }
    };
}
