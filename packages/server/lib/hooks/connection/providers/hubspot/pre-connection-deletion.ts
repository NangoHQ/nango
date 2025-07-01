import { AxiosError, isAxiosError } from 'axios';

import type { InternalNango } from '../../internal-nango.js';
import type { OAuth2Credentials } from '@nangohq/types';

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
