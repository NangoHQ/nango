import { Err, Ok } from '@nangohq/utils';

import * as jwtClient from './jwt.js';
import { AuthCredentialsError } from '../utils/error.js';
import { interpolateStringFromObject } from '../utils/utils.js';

import type { AppCredentials, ConnectionConfig, IntegrationConfig, ProviderCustom, ProviderGithubApp } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Create Github APP credentials
 */
export async function createCredentials({
    provider,
    integration,
    connectionConfig
}: {
    provider: ProviderGithubApp | ProviderCustom;
    integration: IntegrationConfig;
    connectionConfig: ConnectionConfig;
}): Promise<Result<AppCredentials, AuthCredentialsError>> {
    try {
        const templateTokenUrl = typeof provider.token_url === 'string' ? provider.token_url : provider.token_url.APP;
        const tokenUrl = interpolateStringFromObject(templateTokenUrl, { connectionConfig });
        const privateKeyBase64 = integration.custom ? integration.custom['private_key'] : integration.oauth_client_secret;

        const privateKey = Buffer.from(privateKeyBase64 as string, 'base64').toString('utf8');

        const headers = {
            Accept: 'application/vnd.github.v3+json'
        };

        const now = Math.floor(Date.now() / 1000);
        const expiration = now + 10 * 60;

        const payload: Record<string, string | number> = {
            iat: now,
            exp: expiration,
            iss: (integration.custom ? integration.custom['app_id'] : integration.oauth_client_id) as string
        };

        if (!payload['iss'] && connectionConfig['app_id']) {
            payload['iss'] = connectionConfig['app_id'];
        }

        const create = await jwtClient.createCredentialsFromURL({
            privateKey,
            url: tokenUrl,
            payload,
            additionalApiHeaders: headers,
            options: { algorithm: 'RS256' }
        });

        if (create.isErr()) {
            return Err(create.error);
        }

        const rawCredentials = create.value;
        const credentials: AppCredentials = {
            type: 'APP',
            access_token: rawCredentials.token!,
            expires_at: rawCredentials.expires_at,
            raw: rawCredentials
        };

        return Ok(credentials);
    } catch (err) {
        return Err(new AuthCredentialsError('github_app_token_fetch_error', { cause: err }));
    }
}
