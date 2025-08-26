import jwt from 'jsonwebtoken';

import { Err, Ok, axiosInstance as axios } from '@nangohq/utils';

import { AuthCredentialsError } from '../utils/error.js';
import { interpolateObject, interpolateString, stripCredential } from '../utils/utils.js';

import type { JwtCredentials, ProviderJwt } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

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
        const payload: Record<string, any> = {};

        for (const [key, value] of Object.entries(provider.token.payload)) {
            const strippedValue = stripCredential(value);

            if (strippedValue === null) {
                payload[key] = null;
            } else if (typeof strippedValue === 'object') {
                payload[key] = interpolateObject(strippedValue, dynamicCredentials);
            } else if (typeof strippedValue === 'string') {
                payload[key] = interpolateString(strippedValue, dynamicCredentials);
            } else {
                payload[key] = strippedValue;
            }
        }

        payload['iat'] = now;
        payload['exp'] = now + provider.token.expires_in_ms / 1000;

        const header: Record<string, any> = {};

        for (const [key, value] of Object.entries(provider.token.header)) {
            const strippedValue = stripCredential(value);

            if (strippedValue === null) {
                header[key] = null;
            } else if (typeof strippedValue === 'object') {
                header[key] = interpolateObject(strippedValue, dynamicCredentials);
            } else if (typeof strippedValue === 'string') {
                header[key] = interpolateString(strippedValue, dynamicCredentials);
            } else {
                header[key] = strippedValue;
            }
        }

        const signingKey = stripCredential(provider.token.signing_key);
        const interpolatedSigningKey = typeof signingKey === 'string' ? interpolateString(signingKey, dynamicCredentials) : signingKey;

        const pKey = provider.signature.protocol === 'RSA' ? formatPrivateKey(interpolatedSigningKey) : Buffer.from(interpolatedSigningKey, 'hex');
        const token = signJWT({
            payload,
            secretOrPrivateKey: pKey,
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

export function fetchJwtToken({
    privateKey,
    payload,
    options
}: {
    privateKey: string;
    payload: Record<string, string | number>;
    options: object;
}): Result<{ jwtToken: string }, AuthCredentialsError> {
    const hasLineBreak = /^-----BEGIN RSA PRIVATE KEY-----\n/.test(privateKey);

    if (!hasLineBreak) {
        privateKey = privateKey.replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n');
        privateKey = privateKey.replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----');
    }

    try {
        const token = signJWT({ payload, secretOrPrivateKey: privateKey, options });
        return Ok({ jwtToken: token });
    } catch (err) {
        const error = new AuthCredentialsError('refresh_token_external_error', { cause: err });
        return Err(error);
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
    justJwt?: boolean;
    privateKey: string;
    url: string;
    payload: Record<string, string | number>;
    additionalApiHeaders: Record<string, string> | null;
    options: object;
}): Promise<Result<{ tokenResponse: JwtCredentials; jwtToken: string }, AuthCredentialsError>> {
    try {
        const tokenValue = fetchJwtToken({ privateKey, payload, options });
        if (tokenValue.isErr()) {
            return Err(tokenValue.error);
        }
        const { jwtToken } = tokenValue.value;

        const headers = {
            Authorization: `Bearer ${jwtToken}`
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

        return Ok({ tokenResponse: tokenResponse.data, jwtToken });
    } catch (err) {
        const error = new AuthCredentialsError('refresh_token_external_error', { cause: err });
        return Err(error);
    }
}

export function decode(token: string): Record<string, any> | null {
    try {
        return jwt.decode(token) as Record<string, any>;
    } catch {
        return null;
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
