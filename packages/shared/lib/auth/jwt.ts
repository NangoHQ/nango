import axios from 'axios';
import jwt from 'jsonwebtoken';

import { Err, Ok } from '@nangohq/utils';

import { AuthCredentialsError } from '../utils/error.js';

import type { JwtCredentials, ProviderJwt } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Create JWT credentials
 */
export function createCredentials({
    privateKey,
    provider,
    privateKeyId,
    issuerId
}: {
    provider: ProviderJwt;
    privateKey: { id: string; secret: string } | string;
    privateKeyId?: string | undefined;
    issuerId?: string | undefined;
}): Result<JwtCredentials, AuthCredentialsError> {
    const originalPrivateKey = privateKey;
    const originalPrivateKeyId = privateKeyId;

    if (typeof privateKey === 'object') {
        privateKeyId = privateKey.id;
        privateKey = privateKey.secret;
    }

    if (!privateKey) {
        return Err(new AuthCredentialsError('invalid_jwt_private_key'));
    }
    if (!privateKeyId) {
        return Err(new AuthCredentialsError('invalid_jwt_private_key_id'));
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        ...provider.token.payload,
        iat: now,
        exp: now + provider.token.expires_in_ms / 1000
    };
    const header = {
        ...provider.token.headers,
        alg: provider.token.headers.alg,
        kid: privateKeyId
    };

    try {
        const token = signJWT({
            payload,
            secretOrPrivateKey: Buffer.from(privateKey, 'hex'),
            options: { algorithm: provider.token.headers.alg, header }
        });
        const expiresAt = new Date(Date.now() + provider.token.expires_in_ms);

        const credentials: JwtCredentials = {
            type: 'JWT',
            privateKeyId: originalPrivateKeyId || '',
            issuerId: issuerId || '',
            privateKey: originalPrivateKey,
            token,
            expires_at: expiresAt
        };

        return Ok(credentials);
    } catch (err) {
        return Err(err instanceof AuthCredentialsError ? err : new AuthCredentialsError('failed_to_generate', { cause: err }));
    }
}

/**
 * Create JWT credentials from a URL
 */
export async function createCredentialsFromURL({
    privateKey,
    url,
    payload,
    additionalApiHeaders,
    options
}: {
    privateKey: string;
    url: string;
    payload: Record<string, string | number>;
    additionalApiHeaders: Record<string, string> | null;
    options: object;
}): Promise<Result<JwtCredentials, AuthCredentialsError>> {
    const hasLineBreak = /^-----BEGIN RSA PRIVATE KEY-----\n/.test(privateKey);

    if (!hasLineBreak) {
        privateKey = privateKey.replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n');
        privateKey = privateKey.replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----');
    }

    try {
        const token = signJWT({ payload, secretOrPrivateKey: privateKey, options });

        const headers = {
            Authorization: `Bearer ${token}`
        };

        if (additionalApiHeaders) {
            Object.assign(headers, additionalApiHeaders);
        }

        const tokenResponse = await axios.post(
            url,
            {},
            {
                headers
            }
        );

        return Ok(tokenResponse.data);
    } catch (err) {
        const error = new AuthCredentialsError('refresh_token_external_error', { cause: err });
        return Err(error);
    }
}

function signJWT({
    payload,
    secretOrPrivateKey,
    options
}: {
    payload: Record<string, string | number>;
    secretOrPrivateKey: string | Buffer;
    options: object;
}): string {
    try {
        return jwt.sign(payload, secretOrPrivateKey, options);
    } catch (err) {
        throw new AuthCredentialsError('failed_to_sign', { cause: err });
    }
}
