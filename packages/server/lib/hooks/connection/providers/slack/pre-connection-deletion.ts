import axios, { isAxiosError } from 'axios';

import type { InternalNango } from '../../internal-nango.js';
import type { OAuth2Credentials } from '@nangohq/types';

interface SlackRevokeResponse {
    ok: boolean;
    revoked?: boolean;
    error?: string;
}

export default async function execute(nango: InternalNango) {
    try {
        const connection = await nango.getConnection();
        const credentials = connection.credentials as OAuth2Credentials;

        if (!credentials.access_token) {
            return;
        }

        const result = await nango.proxy<SlackRevokeResponse>({
            method: 'GET',
            // https://api.slack.com/methods/auth.revoke
            endpoint: 'https://slack.com/api/auth.revoke',
            providerConfigKey: connection.provider_config_key
        });

        if (isAxiosError(result)) {
            const error = (result.response?.data as SlackRevokeResponse)?.error ?? result.message;
            throw new Error(`Failed to revoke Slack token: ${error}`);
        }

        if (result.data.ok) {
            return;
        }

        if (result.data.error) {
            throw new Error(`Failed to revoke Slack token: ${result.data.error}`);
        }
    } catch (err) {
        if (axios.isAxiosError(err)) {
            const slackError = err.response?.data?.error || err.message;
            throw new Error(`Error revoking Slack token: ${slackError}`);
        }
        throw err;
    }
}
