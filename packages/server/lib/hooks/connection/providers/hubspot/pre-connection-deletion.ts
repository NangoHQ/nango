import type { OAuth2Credentials } from '@nangohq/types';
import type { InternalNango } from '../../post-connection.js';
import axios from 'axios';

export default async function execute(nango: InternalNango) {
    try {
        const connection = await nango.getConnection();
        const credentials = connection.credentials as OAuth2Credentials;

        if (!credentials.refresh_token) {
            return;
        }

        // HubSpot API to delete/revoke refresh token
        const response = await axios.delete(`https://api.hubapi.com/oauth/v1/refresh-tokens/${credentials.refresh_token}`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.status >= 200 && response.status < 300) {
            return;
        } else {
            throw new Error(`Failed to revoke HubSpot token: ${response.status} ${response.statusText}`);
        }
    } catch (err) {
        if (axios.isAxiosError(err)) {
            throw new Error(`Error revoking HubSpot token: ${err.message}`);
        }
        throw err;
    }
}
