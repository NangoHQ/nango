import type { InternalNango as Nango } from '../../internal-nango.js';
import type { OAuth2ClientCredentials } from '@nangohq/types';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();

    const credentials = connection.credentials as OAuth2ClientCredentials;
    const { client_id, client_secret } = credentials;

    await nango.proxy({
        endpoint: '/auth/oauth2/revoke',
        method: 'POST',
        providerConfigKey: connection.provider_config_key,
        headers: {
            authorization: `client_id:${client_id}, client_secret:${client_secret}`,
            'Content-Type': 'application/json'
        },
        data: {
            access_token: credentials.token
        }
    });
}
