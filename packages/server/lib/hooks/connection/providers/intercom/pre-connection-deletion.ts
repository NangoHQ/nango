import type { OAuth2Credentials } from '@nangohq/types';
import type { InternalNango } from '../../shared-hook-logic';
import axios from 'axios';

export default async function execute(nango: InternalNango) {
    try {
        const connection = await nango.getConnection();
        const credentials = connection.credentials as OAuth2Credentials;

        if (!credentials.access_token) {
            return;
        }

        await nango.proxy({
            method: 'POST',
            // https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/installing-uninstalling-apps#revoking-access
            endpoint: 'https://api.intercom.io/auth/uninstall',
            providerConfigKey: connection.provider_config_key,
            data: {},
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            }
        });
        return;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            // Extract error message from Intercom's response structure
            const intercomError = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message;
            throw new Error(`Error revoking Intercom token: ${intercomError}`);
        }
        throw err;
    }
}
