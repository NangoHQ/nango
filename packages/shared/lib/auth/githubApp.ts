import { Err, Ok } from '@nangohq/utils';

import { AuthCredentialsError } from '../utils/error.js';
import { interpolateStringFromObject } from '../utils/utils.js';
import * as jwtClient from './jwt.js';

import type {
    AppCredentials,
    ConnectionConfig,
    DBConnectionDecrypted,
    GithubAppConfigOverride,
    IntegrationConfig,
    ProviderCustom,
    ProviderGithubApp
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Create Github APP credentials
 * The connection's own app (`override`, else the one stored on `connection`) wins over the integration's.
 */
export async function createCredentials({
    connection,
    provider,
    integration,
    connectionConfig,
    refreshGithubAppJwtToken,
    override
}: {
    connection?: DBConnectionDecrypted;
    provider: ProviderGithubApp | ProviderCustom;
    integration: IntegrationConfig;
    connectionConfig: ConnectionConfig;
    refreshGithubAppJwtToken?: boolean | undefined;
    override?: GithubAppConfigOverride | undefined;
}): Promise<Result<AppCredentials, AuthCredentialsError>> {
    try {
        const templateTokenUrl = typeof provider.token_url === 'string' ? provider.token_url : provider.token_url.APP;
        const tokenUrl = interpolateStringFromObject(templateTokenUrl, { connectionConfig });
        const configOverride = override ?? (connection?.credentials.type === 'APP' ? connection.credentials.config_override : undefined);
        const appId = configOverride ? configOverride.app_id : ((integration.custom ? integration.custom['app_id'] : integration.oauth_client_id) as string);
        const privateKeyBase64 = configOverride
            ? configOverride.private_key
            : ((integration.custom ? integration.custom['private_key'] : integration.oauth_client_secret) as string);

        const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');

        const headers = {
            Accept: 'application/vnd.github.v3+json'
        };

        const now = Math.floor(Date.now() / 1000);
        const expiration = now + 10 * 60;

        const payload: Record<string, string | number> = {
            iat: now,
            exp: expiration,
            iss: appId
        };

        if (!payload['iss'] && connectionConfig['app_id']) {
            payload['iss'] = connectionConfig['app_id'];
        }

        if (
            connection &&
            connection.credentials &&
            'expires_at' in connection.credentials &&
            'access_token' in connection.credentials &&
            refreshGithubAppJwtToken
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

            if ('jwtToken' in connection.credentials) {
                connection.credentials['jwtToken'] = jwtToken;
            }

            if ('jwtToken' in connection.credentials.raw) {
                delete connection.credentials.raw['jwtToken'];
            }

            return Ok({
                type: 'APP',
                access_token: connection.credentials['access_token'],
                expires_at: connection.credentials['expires_at'],
                raw: connection.credentials.raw,
                jwtToken,
                config_override: configOverride
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

        return Ok({
            type: 'APP',
            access_token: tokenResponse.token!,
            expires_at: tokenResponse.expires_at,
            raw: tokenResponse,
            jwtToken,
            config_override: configOverride
        });
    } catch (err) {
        return Err(new AuthCredentialsError('github_app_token_fetch_error', { cause: err }));
    }
}
