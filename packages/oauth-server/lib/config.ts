import { z } from 'zod';

import type { JWKS } from 'oidc-provider';

const jwkSchema = z.looseObject({
    kid: z.string().min(1),
    use: z.literal('sig'),
    alg: z.literal('RS256'),
    kty: z.literal('RSA'),
    d: z.string().min(1)
});

const jwksSchema = z.object({ keys: z.array(jwkSchema).min(1) });

export interface OAuthServerParsedConfig {
    baseUrl: string;
    cookieKeys: string[];
    encryptionKey: string;
    jwks: JWKS;
}

export interface OAuthServerRawConfig {
    baseUrl: string | undefined;
    cookieKeys: string | undefined;
    encryptionKey: string | undefined;
    jwks: string | undefined;
}

export function parseOAuthServerConfig(raw: OAuthServerRawConfig): OAuthServerParsedConfig {
    if (!raw.baseUrl || !raw.cookieKeys || !raw.encryptionKey || !raw.jwks) {
        throw new Error('OAuth server baseUrl, cookieKeys, encryptionKey, and jwks are required when OAuth is enabled');
    }

    const baseUrl = parseBaseUrl(raw.baseUrl);
    const cookieKeys = parseJson(raw.cookieKeys, z.array(z.string().min(32)).min(2), 'cookieKeys');
    if (new Set(cookieKeys).size !== cookieKeys.length) {
        throw new Error('OAuth server cookieKeys must contain distinct keys');
    }
    if (Buffer.from(raw.encryptionKey, 'base64').length !== 32) {
        throw new Error('OAuth server encryptionKey must decode to exactly 32 bytes');
    }
    const jwks = parseJson(raw.jwks, jwksSchema, 'jwks') as JWKS;

    return { baseUrl, cookieKeys, encryptionKey: raw.encryptionKey, jwks };
}

function parseBaseUrl(value: string): string {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
        throw new Error('OAuth server baseUrl must use HTTPS, except on loopback');
    }
    if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
        throw new Error('OAuth server baseUrl must be an origin without credentials, path, query, or fragment');
    }
    return url.origin;
}

function parseJson<T>(value: string, schema: z.ZodType<T>, name: string): T {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value) as unknown;
    } catch {
        throw new Error(`${name} must be valid JSON`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
        throw new Error(`${name} is invalid: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
    }
    return result.data;
}
