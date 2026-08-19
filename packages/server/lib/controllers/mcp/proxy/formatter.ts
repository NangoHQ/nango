import JSONBig from 'json-bigint';

import type { ProxyServiceResponse } from '../../../services/proxy.service.js';
import type { ProxyRequestOutput } from './schema.js';

/**
 * Management MCP tool results are fully materialized and serialized into both text and structured content.
 * Keep the response small enough for MCP clients and direct callers to the streaming HTTP proxy for larger payloads.
 * Keep this value and docs/reference/backend/management-mcp.mdx in sync.
 */
export const MAX_MCP_PROXY_RESPONSE_BYTES = 5_000_000;
export const MAX_MCP_PROXY_RESPONSE_SIZE_LABEL = '5 MB';

const textualApplicationMediaTypes = new Set([
    'application/graphql',
    'application/javascript',
    'application/sql',
    'application/x-javascript',
    'application/x-www-form-urlencoded',
    'application/x-yaml',
    'application/xml',
    'application/yaml'
]);

const losslessJson = JSONBig({ protoAction: 'error', constructorAction: 'preserve' });

type ProxyResponseFormatErrorCode = 'response_too_large' | 'unsupported_response_body';

export class ProxyResponseFormatError extends Error {
    public readonly code: ProxyResponseFormatErrorCode;

    constructor(code: ProxyResponseFormatErrorCode, message: string) {
        super(message);
        this.name = 'ProxyResponseFormatError';
        this.code = code;
    }
}

export interface FormattedProxyResponse {
    output: ProxyRequestOutput;
    egressedBytes: number;
}

export async function proxyResponseToMcp(
    response: ProxyServiceResponse,
    { maxBodyBytes = MAX_MCP_PROXY_RESPONSE_BYTES }: { maxBodyBytes?: number } = {}
): Promise<FormattedProxyResponse> {
    const contentType = getContentType(response.headers);
    assertSupportedContentType(contentType, response.body);

    const bodyBuffer = await readBoundedBody(response.body, maxBodyBytes);
    const rawBody = decodeUtf8(bodyBuffer);
    if (rawBody === null) {
        throw new ProxyResponseFormatError(
            'unsupported_response_body',
            'The provider returned a binary or non-UTF-8 response. Use the HTTP proxy for binary responses.'
        );
    }

    return {
        output: {
            status: response.status,
            headers: formatHeaders(response.headers),
            body: formatBody(rawBody, contentType.mediaType)
        },
        egressedBytes: bodyBuffer.length
    };
}

async function readBoundedBody(body: ProxyServiceResponse['body'], maxBodyBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let bodyBytes = 0;
    for await (const unsafeChunk of body) {
        const chunk: unknown = unsafeChunk;
        let buffer: Buffer;
        if (Buffer.isBuffer(chunk)) {
            buffer = chunk;
        } else if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
            buffer = Buffer.from(chunk);
        } else {
            body.destroy();
            throw new Error('Provider response contained an unsupported body chunk');
        }

        bodyBytes += buffer.length;
        if (bodyBytes > maxBodyBytes) {
            body.destroy();
            throw new ProxyResponseFormatError(
                'response_too_large',
                `The provider response exceeds the ${MAX_MCP_PROXY_RESPONSE_SIZE_LABEL} Management MCP limit. Use the HTTP proxy for large responses.`
            );
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks, bodyBytes);
}

function assertSupportedContentType(contentType: ParsedContentType, body: ProxyServiceResponse['body']): void {
    if (contentType.charset && !['utf-8', 'utf8', 'us-ascii'].includes(contentType.charset)) {
        body.destroy();
        throw new ProxyResponseFormatError(
            'unsupported_response_body',
            'The provider returned a non-UTF-8 response. Use the HTTP proxy for responses with other encodings.'
        );
    }
    if (contentType.mediaType && !isTextualMediaType(contentType.mediaType)) {
        body.destroy();
        throw new ProxyResponseFormatError('unsupported_response_body', 'The provider returned a binary response. Use the HTTP proxy for binary responses.');
    }
}

function isTextualMediaType(mediaType: string): boolean {
    return (
        mediaType.startsWith('text/') ||
        mediaType === 'application/json' ||
        mediaType.endsWith('+json') ||
        mediaType.endsWith('+xml') ||
        textualApplicationMediaTypes.has(mediaType)
    );
}

function decodeUtf8(buffer: Buffer): string | null {
    const text = buffer.toString('utf8');
    return Buffer.from(text, 'utf8').equals(buffer) ? text : null;
}

interface ParsedContentType {
    mediaType: string;
    charset?: string | undefined;
}

function getContentType(headers: Record<string, unknown>): ParsedContentType {
    const contentTypeEntry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type');
    const value = contentTypeEntry?.[1];
    const firstValue = Array.isArray(value) ? value[0] : value;
    const contentType = firstValue === undefined || firstValue === null ? '' : formatHeaderValue(firstValue);
    const [rawMediaType = ''] = contentType.split(';', 1);
    const charsetMatch = contentType.match(/(?:^|;)\s*charset\s*=\s*"?([^";\s]+)/i);
    return {
        mediaType: rawMediaType.trim().toLowerCase(),
        ...(charsetMatch?.[1] ? { charset: charsetMatch[1].toLowerCase() } : {})
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
