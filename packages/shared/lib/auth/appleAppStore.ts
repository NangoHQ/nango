import { Err, Ok } from '@nangohq/utils';

import * as jwtClient from './jwt.js';
import { AuthCredentialsError } from '../utils/error.js';
import { interpolateStringFromObject } from '../utils/utils.js';

import type { AppStoreCredentials, ConnectionConfig, ProviderAppleAppStore } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Create Apple App Store credentials
 */
export async function createCredentials({
    provider,
    private_key,
    connectionConfig
}: {
    provider: ProviderAppleAppStore;
    private_key: string;
    connectionConfig: ConnectionConfig;
}): Promise<Result<AppStoreCredentials, AuthCredentialsError>> {
    try {
        const tokenUrl = interpolateStringFromObject(provider.token_url, { connectionConfig });

        const now = Math.floor(Date.now() / 1000);
        const expiration = now + 15 * 60;

        const payload: Record<string, string | number> = {
            iat: now,
            exp: expiration,
            iss: connectionConfig['issuerId']
        };

        if (provider.authorization_params && provider.authorization_params['audience']) {
            payload['aud'] = provider.authorization_params['audience'];
        }

        if (connectionConfig['scope']) {
            payload['scope'] = connectionConfig['scope'];
        }

        const create = await jwtClient.createCredentialsFromURL({
            privateKey: private_key,
            url: tokenUrl,
            payload,
            additionalApiHeaders: null,
            options: {
                header: {
                    alg: 'ES256',
                    kid: connectionConfig['privateKeyId'],
                    typ: 'JWT'
                }
            }
        });

        if (create.isErr()) {
            return Err(create.error);
        }

        const rawCredentials = create.value;
        const credentials: AppStoreCredentials = {
            type: 'APP_STORE',
            access_token: rawCredentials.token!,
            private_key: Buffer.from(private_key).toString('base64'),
            expires_at: rawCredentials.expires_at,
            raw: rawCredentials
        };

        return Ok(credentials);
    } catch (err) {
        return Err(new AuthCredentialsError('bill_tokens_fetch_error', { cause: err }));
    }
}
