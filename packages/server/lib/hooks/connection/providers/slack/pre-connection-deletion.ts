import type { OAuth2Credentials } from '@nangohq/types';
import axios from 'axios';
import type { InternalNango } from '../../shared-hook-logic';

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

        if (result && 'data' in result && result.data?.ok) {
            return;
        } else if (result && 'data' in result) {
            // Handle known error cases from Slack API
            const error = result.data?.error || 'Unknown error from Slack';
            throw new Error(`Failed to revoke Slack token: ${error}`);
        } else {
            const errorMessage = (result as any)?.message || 'Unknown error during Slack token revocation';
            throw new Error(`Failed to revoke Slack token: ${errorMessage}`);
        }
    } catch (err) {
        if (axios.isAxiosError(err)) {
            // Handle rate limits and other Slack API errors
            const slackError = err.response?.data?.error || err.message;
            throw new Error(`Error revoking Slack token: ${slackError}`);
        }
        throw err;
    }
}
