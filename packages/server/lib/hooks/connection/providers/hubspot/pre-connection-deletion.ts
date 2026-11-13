import { AxiosError, isAxiosError } from 'axios';

import type { InternalNango } from '../../internal-nango.js';
import type { OAuth2Credentials } from '@nangohq/types';

export default async function execute(nango: InternalNango) {
    try {
        const connection = await nango.getConnection();
        const credentials = connection.credentials as OAuth2Credentials;

        // Some customers share the same HubSpot refresh token across multiple Nango connections (e.g. one
        // portal, one OAuth app, multiple connections). Revoking it when one connection is deleted would
        // break the others, so allow opting out via metadata.
        if (connection.metadata?.['skipTokenRevocation'] === true) {
            return;
        }

        if (!credentials.refresh_token) {
            return;
        }

        const integration = await nango.getIntegration();
        const clientId = credentials.config_override?.client_id ?? integration?.oauth_client_id;
        const clientSecret = credentials.config_override?.client_secret ?? integration?.oauth_client_secret;
        if (!clientId || !clientSecret) {
            return;
        }

        const response = await nango.proxy({
            method: 'POST',
            // https://developers.hubspot.com/docs/api-reference/latest/authentication/oauth-tokens/revoke-token
            endpoint: 'https://api.hubapi.com/oauth/2026-09/token/revoke',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: '' // override Authorization header
            },
            data: new URLSearchParams({
                token: credentials.refresh_token,
                client_id: clientId,
                client_secret: clientSecret
            }).toString(),
            providerConfigKey: connection.provider_config_key
        });

        if (response instanceof AxiosError) {
            throw response;
        }

        if (response.status >= 400) {
            const errorData = response.data;
            const message = errorData?.message || `Unexpected status code: ${response.status}`;
            throw new Error(`Failed to revoke HubSpot token: ${message}`);
        } else {
            return;
        }
    } catch (err) {
        if (isAxiosError(err)) {
            const message = err.response?.data?.message || err.message;
            throw new Error(`Error revoking HubSpot token: ${message}`);
        }
        throw err;
    }
}
