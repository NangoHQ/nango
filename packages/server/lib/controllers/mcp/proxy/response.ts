import type { ProxyServiceResponse } from '../../../services/proxy.service.js';

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

type ProxyResponseFormatErrorCode = 'response_too_large' | 'unsupported_response_body';

export class ProxyResponseFormatError extends Error {
    public readonly code: ProxyResponseFormatErrorCode;

    constructor(code: ProxyResponseFormatErrorCode, message: string) {
        super(message);
        this.name = 'ProxyResponseFormatError';
        this.code = code;
    }
}

export async function readProxyResponseBody(response: ProxyServiceResponse): Promise<Buffer> {
    const contentType = getContentType(response.headers);
    assertSupportedContentType(contentType, response.body);

    const bodyBuffer = await readBoundedBody(response.body);
    if (!isUtf8(bodyBuffer)) {
        throw new ProxyResponseFormatError(
            'unsupported_response_body',
            'The provider returned a binary or non-UTF-8 response. Use the HTTP proxy for binary responses.'
        );
    }
    return bodyBuffer;
}

export function getProxyResponseMediaType(headers: Record<string, unknown>): string {
    return getContentType(headers).mediaType;
}

async function readBoundedBody(body: ProxyServiceResponse['body']): Promise<Buffer> {
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
        if (bodyBytes > MAX_MCP_PROXY_RESPONSE_BYTES) {
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

function isUtf8(buffer: Buffer): boolean {
    const text = buffer.toString('utf8');
    return Buffer.from(text, 'utf8').equals(buffer);
}

interface ParsedContentType {
    mediaType: string;
    charset?: string | undefined;
}

function getContentType(headers: Record<string, unknown>): ParsedContentType {
    const contentTypeEntry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type');
    const value = contentTypeEntry?.[1];
    const firstValue: unknown = Array.isArray(value) ? value[0] : value;
    const contentType = firstValue === undefined || firstValue === null ? '' : formatHeaderValue(firstValue);
    const [rawMediaType = ''] = contentType.split(';', 1);
    const charsetMatch = contentType.match(/(?:^|;)\s*charset\s*=\s*"?([^";\s]+)/i);
    return {
        mediaType: rawMediaType.trim().toLowerCase(),
        ...(charsetMatch?.[1] ? { charset: charsetMatch[1].toLowerCase() } : {})
    };
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
