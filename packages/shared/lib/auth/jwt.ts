import axios from 'axios';
import jwt from 'jsonwebtoken';

import { Err, Ok } from '@nangohq/utils';

import { AuthCredentialsError } from '../utils/error.js';

import type { JwtCredentials, ProviderJwt } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import { interpolateObject, interpolateString, stripCredential } from '../utils/utils.js';

/**
 * Create JWT credentials
 */
export function createCredentials({
    config,
    provider,
    dynamicCredentials
}: {
    config: string;
    provider: ProviderJwt;
    dynamicCredentials: Record<string, any>;
}): Result<JwtCredentials, AuthCredentialsError> {
    try {
        //Check if the provider is 'ghost-admin' and if privateKey is a string
        if (config.includes('ghost-admin') && typeof dynamicCredentials['privateKey'] === 'string') {
            const privateKeyString = dynamicCredentials['privateKey'];
            const [id, secret] = privateKeyString.split(':');
            dynamicCredentials['privateKey'] = { id, secret };
        }
        const now = Math.floor(Date.now() / 1000);
        const payload = Object.entries(provider.token.payload).reduce<Record<string, any>>((acc, [key, value]) => {
            const strippedValue = stripCredential(value);

            if (typeof strippedValue === 'object' && strippedValue !== null) {
                acc[key] = interpolateObject(strippedValue, dynamicCredentials);
            } else if (typeof strippedValue === 'string') {
                acc[key] = interpolateString(strippedValue, dynamicCredentials);
            } else {
                acc[key] = strippedValue;
            }
            return acc;
        }, {});

        payload['iat'] = now;
        payload['exp'] = now + provider.token.expires_in_ms / 1000;

        const header = Object.entries(provider.token.header).reduce<Record<string, any>>((acc, [key, value]) => {
            const strippedValue = stripCredential(value);

            if (typeof strippedValue === 'object' && strippedValue !== null) {
                acc[key] = interpolateObject(strippedValue, dynamicCredentials);
            } else if (typeof strippedValue === 'string') {
                acc[key] = interpolateString(strippedValue, dynamicCredentials);
            } else {
                acc[key] = strippedValue;
            }
            return acc;
        }, {});

        const signingKey = stripCredential(provider.token.signing_key);
        const interpolatedSigningKey = typeof signingKey === 'string' ? interpolateString(signingKey, dynamicCredentials) : signingKey;

        const token =
            provider.signature.protocol === 'RSA'
                ? signJWT({
                      payload,
                      secretOrPrivateKey: formatPrivateKey(interpolatedSigningKey),
                      options: { algorithm: provider.token.header.alg, header }
                  })
                : signJWT({
                      payload,
                      secretOrPrivateKey: Buffer.from(interpolatedSigningKey, 'hex'),
                      options: { algorithm: provider.token.header.alg, header }
                  });
        return Ok({
            type: 'JWT',
            ...dynamicCredentials,
            token,
            expires_at: new Date(Date.now() + provider.token.expires_in_ms)
        });
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

function formatPrivateKey(key: string): string {
    return key.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n').replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
}
