import JSONBig from 'json-bigint';

import { getProxyResponseMediaType } from './response.js';

import type { ProxyServiceResponse } from '../../../services/proxy.service.js';
import type { ProxyRequestOutput } from './schema.js';

const losslessJson = JSONBig({ protoAction: 'error', constructorAction: 'preserve' });

export function proxyResponseToMcp(response: ProxyServiceResponse, body: Buffer): ProxyRequestOutput {
    return {
        status: response.status,
        headers: formatHeaders(response.headers),
        body: formatBody(body.toString('utf8'), getProxyResponseMediaType(response.headers))
    };
}

function formatHeaders(headers: Record<string, unknown>): Record<string, string | string[]> {
    const formatted: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        if (Array.isArray(value)) {
            formatted[name] = value.map(formatHeaderValue);
            continue;
        }
        formatted[name] = formatHeaderValue(value);
    }
    return formatted;
}

function formatBody(body: string, mediaType: string): ProxyRequestOutput['body'] {
    if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
        try {
            const jsonBody: unknown = losslessJson.parse(stripByteOrderMark(body));
            return normalizeLosslessJson(jsonBody);
        } catch {
            // Preserve invalid JSON payloads as text.
        }
    }
    return body;
}

/**
 * json-bigint parses long numeric tokens as BigNumber objects. Safe integers remain numbers; unsafe integers and
 * high-precision decimals become strings so MCP serialization cannot silently round provider data.
 */
function normalizeLosslessJson(value: unknown): ProxyRequestOutput['body'] {
    if (isJsonBigNumber(value)) {
        const number = value.toNumber();
        return value.isInteger() && Number.isSafeInteger(number) ? number : value.toFixed();
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeLosslessJson(item));
    }
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeLosslessJson(item)]));
    }
    throw new Error('Lossless JSON parser returned an unsupported value');
}

interface JsonBigNumber {
    readonly _isBigNumber: true;
    isInteger(): boolean;
    toFixed(): string;
    toNumber(): number;
}

function isJsonBigNumber(value: unknown): value is JsonBigNumber {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
        candidate['_isBigNumber'] === true &&
        typeof candidate['isInteger'] === 'function' &&
        typeof candidate['toFixed'] === 'function' &&
        typeof candidate['toNumber'] === 'function'
    );
}

function stripByteOrderMark(value: string): string {
    return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function formatHeaderValue(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return value.toString();
    }
    return JSON.stringify(value);
}
