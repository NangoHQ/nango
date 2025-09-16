import { axiosInstance as axios, report } from '@nangohq/utils';

import { getGlobalOAuthCallbackUrl } from '../utils/utils.js';

import type { DBEnvironment, DBTeam, Provider } from '@nangohq/types';

interface McpRegisterResponse {
    client_id: string;
    redirect_uris: string[];
    client_name: string;
    grant_types: string[];
    response_types: string[];
    token_endpoint_auth_method: string;
    registration_client_uri: string;
    client_id_issued_at: number;
}

export async function registerClientId({ provider, environment, team }: { provider: Provider; environment: DBEnvironment; team: DBTeam }): Promise<string> {
    if (provider.auth_mode !== 'MCP_OAUTH2' || !('registration_url' in provider)) {
        throw new Error('Provider is not MCP');
    }
    try {
        const registrationUrl = provider.registration_url;
        const body = {
            redirect_uris: [environment.callback_url || getGlobalOAuthCallbackUrl()],
            token_endpoint_auth_method: 'none',
            client_name: `${team.name} - ${environment.name} - ${provider.display_name}`
        };
        const { data } = await axios.post<McpRegisterResponse>(registrationUrl, body);

        return data.client_id;
    } catch (err) {
        report(err);
    }

    throw new Error('Failed to register MCP client ID');
}
