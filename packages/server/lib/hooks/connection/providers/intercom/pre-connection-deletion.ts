import type { OAuth2Credentials } from '@nangohq/types';
import type { InternalNango } from '../../post-connection.js';
import axios from 'axios';

export default async function execute(nango: InternalNango) {
    try {
        const connection = await nango.getConnection();
        const credentials = connection.credentials as OAuth2Credentials;

        if (!credentials.access_token) {
            return;
        }

        // Intercom API to revoke access token
        const response = await axios.post(
            // https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/installing-uninstalling-apps#revoking-access
            'https://api.intercom.io/auth/uninstall',
            {},
            {
                headers: {
                    Authorization: `Bearer ${credentials.access_token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.status >= 200 && response.status < 300) {
            return;
        } else {
            throw new Error(`Failed to revoke Intercom token: ${response.status} ${response.statusText}`);
        }
    } catch (err) {
        if (axios.isAxiosError(err)) {
            throw new Error(`Error revoking Intercom token: ${err.message}`);
        }
        throw err;
    }
}
