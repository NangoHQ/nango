import type { OAuth2Credentials } from '@nangohq/types';
import type { InternalNango } from '../../shared-hook-logic';
import { AxiosError, isAxiosError } from 'axios';

export default async function execute(nango: InternalNango) {
    try {
        const connection = await nango.getConnection();
        const credentials = connection.credentials as OAuth2Credentials;

        if (!credentials.refresh_token) {
            return;
        }
        const response = await nango.proxy({
            method: 'DELETE',
            // https://developers.hubspot.com/docs/guides/api/app-management/oauth-tokens#delete-a-refresh-token
            endpoint: `https://api.hubapi.com/oauth/v1/refresh-tokens/${credentials.refresh_token}`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: '' // override Authorization header
            },
            providerConfigKey: connection.provider_config_key
        });

        if (response instanceof AxiosError) {
            throw response;
        }

        if (response.status === 204 || response.status === 200) {
            return;
        } else {
            const errorData = response.data;
            const message = errorData?.message || `Unexpected status code: ${response.status}`;
            throw new Error(`Failed to revoke HubSpot token: ${message}`);
        }
    } catch (err) {
        if (isAxiosError(err)) {
            let specificMessage = err.message;
            if (err.response && err.response.data) {
                const errorData = err.response.data;
                if (errorData && typeof errorData.message === 'string') {
                    specificMessage = errorData.message;
                }
            }
            throw new Error(`Error revoking HubSpot token: ${specificMessage}`);
        }
        throw err;
    }
}
