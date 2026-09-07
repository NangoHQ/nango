import JSONBig from 'json-bigint';

import { getProxyResponseMediaType, isProxyResponseJsonMediaType } from './mcpProxyResponse.js';

import type { ProxyRequestOutput } from './mcpProxySchema.js';
import type { ProxyServiceResponse } from './proxy.service.js';

const losslessJson = JSONBig({ protoAction: 'error', constructorAction: 'preserve' });

export function proxyResponseToMcp(response: ProxyServiceResponse, body: Buffer): ProxyRequestOutput {
    return {
        status: response.status,
        headers: formatHeaders(response.headers, response.wasCompressed),
        body: formatBody(body.toString('utf8'), getProxyResponseMediaType(response.headers))
    };
}

function formatHeaders(headers: Record<string, unknown>, wasCompressed: boolean | undefined): Record<string, string | string[]> {
    const formatted: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(headers)) {
        if (wasCompressed && name.toLowerCase() === 'content-length') {
            continue;
        }
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
    if (isProxyResponseJsonMediaType(mediaType)) {
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
 * Past this the number is written in exponential notation instead. toFixed() writes every digit out,
 * so an extreme exponent expands a short literal into a huge string: json-bigint rejects overflow
 * (1e309 throws) but not underflow (1e-9999999 parses to a BigNumber and formats to ten million
 * characters), and the response byte limit is applied before formatting. Real identifiers and
 * decimals sit far inside this, so nothing legitimate changes shape.
 */
const MAX_POSITIONAL_EXPONENT = 100;

/**
 * json-bigint parses long numeric tokens as BigNumber objects. Safe integers remain numbers; unsafe integers and
 * high-precision decimals become strings so MCP serialization cannot silently round provider data.
 */
function normalizeLosslessJson(value: unknown): ProxyRequestOutput['body'] {
    if (isJsonBigNumber(value)) {
        const number = value.toNumber();
        if (value.isInteger() && Number.isSafeInteger(number)) {
            return number;
        }
        // Read the exponent rather than measuring toFixed(), which would build the huge string first.
        return Math.abs(value.e ?? 0) > MAX_POSITIONAL_EXPONENT ? value.toString() : value.toFixed();
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) && !Number.isSafeInteger(value) ? value.toString() : value;
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
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
    /** Base 10 exponent. Optional so a build without it falls back to the positional format, as before. */
    readonly e?: number | null;
    isInteger(): boolean;
    toFixed(): string;
    toString(): string;
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
