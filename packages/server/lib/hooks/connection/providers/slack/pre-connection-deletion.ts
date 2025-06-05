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

        // https://api.slack.com/methods/auth.revoke
        const response = await axios.get('https://slack.com/api/auth.revoke', {
            headers: {
                Authorization: `Bearer ${credentials.access_token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        // Slack returns success with "ok": true
        if (response.data && response.data.ok === true) {
            return;
        } else {
            throw new Error(`Failed to revoke Slack token: ${response.data?.error || 'Unknown error'}`);
        }
    } catch (err) {
        if (axios.isAxiosError(err)) {
            throw new Error(`Error revoking Slack token: ${err.message}`);
        }
        throw err;
    }
}
