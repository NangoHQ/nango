import { isAxiosError } from 'axios';

import { axiosInstance as axios, report } from '@nangohq/utils';

import { getGlobalOAuthCallbackUrl } from '../utils/utils.js';

import type { DBEnvironment, DBTeam, Provider } from '@nangohq/types';

interface McpRegisterResponse {
    client_id: string;
    client_secret?: string;
    redirect_uris: string[];
    client_name: string;
    grant_types: string[];
    response_types: string[];
    token_endpoint_auth_method: string;
    registration_client_uri?: string;
    registration_access_token?: string;
    client_id_issued_at: number;
}

export async function registerClientId({
    provider,
    environment,
    team
}: {
    provider: Provider;
    environment: DBEnvironment;
    team: DBTeam;
}): Promise<{ client_id: string; client_secret?: string; registration_client_uri?: string; registration_access_token?: string }> {
    if (provider.auth_mode !== 'MCP_OAUTH2' || !('registration_url' in provider)) {
        throw new Error('Provider is not MCP');
    }
    try {
        const registrationUrl = provider.registration_url;
        const body = {
            redirect_uris: [environment.callback_url || getGlobalOAuthCallbackUrl()],
            token_endpoint_auth_method: 'none',
            client_name: `${team.name} - ${environment.name} - ${provider.display_name}`,
            ...Object.fromEntries(Object.entries(provider.registration_params ?? {}).filter(([key]) => key === 'response_types' || key === 'grant_types'))
        };
        const { data } = await axios.post<McpRegisterResponse>(registrationUrl, body);

        return {
            client_id: data.client_id,
            ...(data.client_secret && { client_secret: data.client_secret }),
            ...(data.registration_client_uri && { registration_client_uri: data.registration_client_uri }),
            ...(data.registration_access_token && { registration_access_token: data.registration_access_token })
        };
    } catch (err) {
        report(err);
    }

    throw new Error('Failed to register MCP client ID');
}

/**
 * Best-effort deregistration of a dynamically-registered MCP client (RFC 7592). Failures are
 * reported, not thrown, so cleanup never masks the original error that triggered it.
 *
 * `registrationClientUri` comes from the provider, not Nango, so we require HTTPS + same-origin
 * as `registrationUrl` before sending the bearer token, and disable redirects.
 */
export async function deregisterClientId({
    registrationUrl,
    registrationClientUri,
    registrationAccessToken
}: {
    registrationUrl: string;
    registrationClientUri: string;
    registrationAccessToken?: string | undefined;
}): Promise<void> {
    let clientUri: URL;
    let trustedOrigin: URL;
    try {
        clientUri = new URL(registrationClientUri);
        trustedOrigin = new URL(registrationUrl);
    } catch {
        report(new Error('Failed to deregister MCP client (invalid registration URL)'));
        return;
    }

    if (clientUri.protocol !== 'https:' || clientUri.origin !== trustedOrigin.origin) {
        report(new Error('Failed to deregister MCP client (registration_client_uri is not a trusted HTTPS origin)'));
        return;
    }

    try {
        await axios.delete(registrationClientUri, {
            maxRedirects: 0,
            ...(registrationAccessToken ? { headers: { Authorization: `Bearer ${registrationAccessToken}` } } : {})
        });
    } catch (err) {
        const detail = isAxiosError(err) ? (err.response ? `status ${err.response.status}` : (err.code ?? 'network error')) : 'unknown error';
        report(new Error(`Failed to deregister MCP client (${detail})`));
    }
}
