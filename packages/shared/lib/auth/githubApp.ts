import { Err, Ok } from '@nangohq/utils';

import * as jwtClient from './jwt.js';
import { REFRESH_MARGIN_TEN } from '../services/connections/utils.js';
import { AuthCredentialsError } from '../utils/error.js';
import { interpolateStringFromObject, isTokenExpired } from '../utils/utils.js';

import type { AppCredentials, ConnectionConfig, DBConnectionDecrypted, IntegrationConfig, ProviderCustom, ProviderGithubApp } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Create Github APP credentials
 */
export async function createCredentials({
    connection,
    provider,
    integration,
    connectionConfig
}: {
    connection?: DBConnectionDecrypted;
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

        if (
            connection &&
            connection.credentials &&
            'expires_at' in connection.credentials &&
            'access_token' in connection.credentials &&
            !isTokenExpired(connection.credentials.expires_at, REFRESH_MARGIN_TEN)
        ) {
            const createdJwtToken = jwtClient.fetchJwtToken({
                privateKey,
                payload,
                options: { algorithm: 'RS256' }
            });
            if (createdJwtToken.isErr()) {
                return Err(createdJwtToken.error);
            }
            const { jwtToken } = createdJwtToken.value;
            const decodedJwt = jwtClient.decode(jwtToken);
            const expirationFromJwt = decodedJwt?.['exp'];

            return Ok({
                type: 'APP',
                access_token: connection.credentials['access_token'],
                expires_at: connection.credentials['expires_at'],
                raw: connection.credentials,
                jwtToken: {
                    token: jwtToken,
                    expires_at: expirationFromJwt ? expirationFromJwt * 1000 : 0
                },
                app: connection.credentials
            });
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

        const { tokenResponse, jwtToken } = create.value;

        const decodedJwt = jwtClient.decode(jwtToken);
        const expirationFromJwt = decodedJwt?.['exp'];

        const credentials: AppCredentials = {
            type: 'APP',
            access_token: tokenResponse.token!,
            expires_at: tokenResponse.expires_at,
            raw: tokenResponse,
            jwtToken: {
                token: jwtToken,
                expires_at: expirationFromJwt ? expirationFromJwt * 1000 : 0
            }
        };

        return Ok(credentials);
    } catch (err) {
        return Err(new AuthCredentialsError('github_app_token_fetch_error', { cause: err }));
    }
}
