import os from 'node:os';

import { NANGO_VERSION } from './version.js';

// Headers that are never relevant to the outcome of the call
const IGNORED_HEADERS = new Set([
    'access-control-allow-credentials',
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-allow-origin',
    'access-control-expose-headers',
    'alt-svc',
    'cf-ray',
    'cf-cache-status',
    'connection',
    'content-security-policy',
    'content-security-policy-report-only',
    'cookie',
    'keep-alive',
    'nel',
    'permissions-policy',
    'referrer-policy',
    'report-to',
    'server',
    'server-timing',
    'set-cookie',
    'strict-transport-security',
    'timing-allow-origin',
    'vary',
    'x-amzn-trace-id',
    'x-amz-cf-id',
    'x-amz-cf-pop',
    'x-amzn-requestid',
    'x-cache',
    'x-backend',
    'x-content-type-options',
    'x-dns-prefetch-control',
    'x-download-options',
    'x-edge-backend',
    'x-frame-options',
    'x-hubspot-correlation-id',
    'x-powered-by',
    'x-server',
    'x-xss-protection'
]);

export function redactHeaders({
    headers,
    headersToFilter = [],
    valuesToFilter = []
}: { headers?: Record<string, any> | undefined; headersToFilter?: string[]; valuesToFilter?: string[] } = {}) {
    if (headers === undefined) {
        return {};
    }

    const safeHeaders: Record<string, string> = {};
    for (const key of Object.keys(headers)) {
        const lowerKey = key.toLocaleLowerCase();
        if (IGNORED_HEADERS.has(lowerKey)) {
            continue;
        }
        safeHeaders[lowerKey] = String(headers[key]);
    }

    if (safeHeaders['authorization']) {
        safeHeaders['authorization'] = 'REDACTED';
    }

    for (const key of headersToFilter) {
        const lowerKey = key.toLocaleLowerCase();
        if (safeHeaders[lowerKey]) {
            safeHeaders[lowerKey] = 'REDACTED';
        }
    }

    for (const key of Object.keys(safeHeaders)) {
        for (const value of valuesToFilter) {
            if (safeHeaders[key]?.includes(value)) {
                safeHeaders[key] = 'REDACTED';
            }
        }
    }

    return safeHeaders;
}

export function redactURL({ url, valuesToFilter }: { url: string; valuesToFilter: string[] }) {
    return valuesToFilter.reduce((curr, value) => {
        return curr.replace(value, 'REDACTED');
    }, url);
}

export function redactObjectOrString<TData extends string | Record<string, any>>({ data, valuesToFilter }: { data: TData; valuesToFilter: string[] }): TData {
    if (typeof data !== 'string') {
        return JSON.parse(redactURL({ url: JSON.stringify(data), valuesToFilter })) as TData;
    }
    return redactURL({ url: data, valuesToFilter }) as TData;
}

export const userAgent = (() => {
    const clientVersion = NANGO_VERSION;
    const nodeVersion = process.versions.node;

    const osName = os.platform().replace(' ', '_');
    const osVersion = os.release().replace(' ', '_');
    return `nango/${clientVersion} (${osName}/${osVersion}; node.js/${nodeVersion})`;
})();
