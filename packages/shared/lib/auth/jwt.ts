import jwt from 'jsonwebtoken';

import { axiosInstance as axios, Err, Ok } from '@nangohq/utils';

import { assertSafeOAuthUrl, getOAuthAxiosRequestConfig } from '../services/proxy/outbound-policy.js';
import { AuthCredentialsError } from '../utils/error.js';
import { formatPem, interpolateObject, interpolateString, stripCredential } from '../utils/utils.js';

import type { JwtCredentials, ProviderJwt, ProviderTwoStep } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Create JWT credentials
 */
export function createCredentials({
    config,
    provider,
    dynamicCredentials,
    connectionConfig = {}
}: {
    config: string;
    provider: ProviderJwt | ProviderTwoStep;
    dynamicCredentials: Record<string, any>;
    connectionConfig?: Record<string, any>;
}): Result<JwtCredentials, AuthCredentialsError> {
    try {
        if (!provider.token) {
            return Err(new AuthCredentialsError('missing_toke_body'));
        }

        if (!provider.signature) {
            return Err(new AuthCredentialsError('missing_signature_type'));
        }
        //Check if the provider is 'ghost-admin' and if privateKey is a string
        if (config.includes('ghost-admin') && typeof dynamicCredentials['privateKey'] === 'string') {
            const privateKeyString = dynamicCredentials['privateKey'];
            const [id, secret] = privateKeyString.split(':');
            dynamicCredentials['privateKey'] = { id, secret };
        }
        const now = Math.floor(Date.now() / 1000);
        const mergedConnectionConfig = { ...(dynamicCredentials['connectionConfig'] as Record<string, any> | undefined), ...connectionConfig };
        const replacers = { ...dynamicCredentials, connectionConfig: mergedConnectionConfig };
        const isUnresolved = (value: string) => /\$\{[^{}]*\}/.test(value);
        const resolvePayloadArray = (values: any[]): { value: string[]; hasContent: boolean } => {
            const resolved = values.flatMap((item) => {
                if (typeof item !== 'string') {
                    return [];
                }
                const strippedItem = stripCredential(item);
                const interpolatedItem = interpolateString(strippedItem, replacers);
                if (isUnresolved(interpolatedItem)) {
                    return [];
                }
                return interpolatedItem
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean);
            });
            return { value: resolved, hasContent: resolved.length > 0 };
        };
        const payload: Record<string, any> = {};

        for (const [key, value] of Object.entries(provider.token.payload)) {
            if (Array.isArray(value)) {
                const { value: resolved, hasContent } = resolvePayloadArray(value);
                if (hasContent) {
                    payload[key] = resolved;
                }
                continue;
            }

            const strippedValue = stripCredential(value);

            if (strippedValue === null) {
                payload[key] = null;
            } else if (typeof strippedValue === 'object') {
                payload[key] = interpolateObject(strippedValue, replacers);
            } else if (typeof strippedValue === 'string') {
                const interpolated = interpolateString(strippedValue, replacers);
                if (!isUnresolved(interpolated)) {
                    payload[key] = interpolated;
                }
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
                header[key] = interpolateObject(strippedValue, replacers);
            } else if (typeof strippedValue === 'string') {
                const interpolated = interpolateString(strippedValue, replacers);
                if (!isUnresolved(interpolated)) {
                    header[key] = interpolated;
                }
            } else {
                header[key] = strippedValue;
            }
        }

        const signingKey = stripCredential(provider.token.signing_key);
        const interpolatedSigningKey = typeof signingKey === 'string' ? interpolateString(signingKey, replacers) : signingKey;

        const pKey = (() => {
            if (provider.signature.protocol !== 'HMAC') {
                const headerMatch = /-----BEGIN ([A-Z0-9 ]+)-----/.exec(interpolatedSigningKey);
                const keyType = (headerMatch?.[1] as 'PRIVATE KEY' | 'RSA PRIVATE KEY' | 'EC PRIVATE KEY' | undefined) ?? 'PRIVATE KEY';
                return formatPem(interpolatedSigningKey, keyType);
            }
            const hmacEncoding = provider.signature.hmac_secret_encoding ?? 'hex';
            if (hmacEncoding === 'utf8') {
                return interpolatedSigningKey;
            }
            return Buffer.from(interpolatedSigningKey, 'hex');
        })();
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
    try {
        const headerMatch = /-----BEGIN ([A-Z0-9 ]+)-----/.exec(privateKey);
        const keyType = (headerMatch?.[1] as 'PRIVATE KEY' | 'RSA PRIVATE KEY' | 'EC PRIVATE KEY' | undefined) ?? 'PRIVATE KEY';
        const formattedPrivateKey = formatPem(privateKey, keyType);
        const token = signJWT({ payload, secretOrPrivateKey: formattedPrivateKey, options });
        return Ok({ jwtToken: token });
    } catch (err) {
        return Err(err instanceof AuthCredentialsError ? err : new AuthCredentialsError('failed_to_sign', { cause: err }));
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

        await assertSafeOAuthUrl(url);

        const tokenResponse = await axios.post(
            url,
            {},
            {
                headers,
                ...getOAuthAxiosRequestConfig()
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

export function signJWT({
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
