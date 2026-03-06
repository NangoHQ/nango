import crypto from 'node:crypto';

import type { AwsSigV4Credentials } from '@nangohq/types';

interface SignRequestInput {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string | Buffer | null;
    credentials: AwsSigV4Credentials;
    now?: Date;
}

export function signAwsSigV4Request({ url, method, headers, body, credentials, now }: SignRequestInput): Record<string, string> {
    const target = new URL(url);
    const timestamp = now ?? new Date();
    const amzDate = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        normalizedHeaders[key.toLowerCase()] = value;
    }
    normalizedHeaders['host'] = target.host;
    normalizedHeaders['x-amz-date'] = amzDate;

    if (credentials.session_token) {
        normalizedHeaders['x-amz-security-token'] = credentials.session_token;
    }

    const payloadHash = hashPayload(body, credentials.service);
    normalizedHeaders['x-amz-content-sha256'] = payloadHash;

    const canonicalHeaders = Object.keys(normalizedHeaders)
        .sort()
        .map((key) => {
            const value = normalizedHeaders[key] ?? '';
            return `${key}:${value.trim()}\n`;
        })
        .join('');
    const signedHeaders = Object.keys(normalizedHeaders).sort().join(';');

    const canonicalRequest = [
        method.toUpperCase(),
        buildCanonicalUri(target.pathname),
        buildCanonicalQuerystring(target.searchParams),
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');

    const credentialScope = `${dateStamp}/${credentials.region}/${credentials.service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, hashHex(canonicalRequest)].join('\n');

    const signingKey = getSignatureKey(credentials.secret_access_key, dateStamp, credentials.region, credentials.service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.access_key_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
        ...normalizedHeaders,
        authorization
    };
}

function buildCanonicalUri(pathname: string): string {
    if (!pathname) {
        return '/';
    }
    const canonical = pathname
        .split('/')
        .map((segment) => encodeRfc3986(segment))
        .join('/');
    if (canonical === '') {
        return '/';
    }
    return canonical.startsWith('/') ? canonical : `/${canonical}`;
}

function buildCanonicalQuerystring(params: URLSearchParams): string {
    const entries: [string, string][] = [];
    params.forEach((value, key) => {
        entries.push([encodeRfc3986(key), encodeRfc3986(value)]);
    });
    entries.sort(([aKey, aValue], [bKey, bValue]) => {
        if (aKey === bKey) {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        }
        return aKey < bKey ? -1 : 1;
    });
    return entries.map(([key, value]) => `${key}=${value}`).join('&');
}

function hashPayload(body: string | Buffer | null | undefined, service: string): string {
    if (typeof body === 'string') {
        return crypto.createHash('sha256').update(body, 'utf8').digest('hex');
    }
    if (Buffer.isBuffer(body)) {
        return crypto.createHash('sha256').update(body).digest('hex');
    }
    // S3 supports UNSIGNED-PAYLOAD for requests without a body (e.g. GET/HEAD);
    // other services (STS, API Gateway, etc.) require a real hash.
    if (service === 's3') {
        return 'UNSIGNED-PAYLOAD';
    }
    return crypto.createHash('sha256').update('').digest('hex');
}

function hashHex(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function getSignatureKey(secret: string, dateStamp: string, regionName: string, serviceName: string) {
    const kDate = crypto.createHmac('sha256', `AWS4${secret}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    return crypto.createHmac('sha256', kService).update('aws4_request').digest();
}

function encodeRfc3986(value: string): string {
    return encodeURIComponent(value).replace(/[!*'()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
