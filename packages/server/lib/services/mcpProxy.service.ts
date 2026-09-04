import JSONBig from 'json-bigint';
import * as z from 'zod/v4';

import { Err, getLogger, Ok } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../controllers/mcp/utils.js';
import { egressTelemetryRecorder } from '../utils/egressTelemetry.js';
import proxyService from './proxy.service.js';

import type { ProxyServiceError, ProxyServiceResponse } from './proxy.service.js';
import type { DBEnvironment, DBPlan, DBTeam, HTTP_METHOD } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Server.MCP.Proxy');
const losslessJson = JSONBig({ protoAction: 'error', constructorAction: 'preserve' });

/**
 * MCP tool results are fully materialized and serialized into both text and structured content.
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
const jsonMediaTypes = new Set(['application/json', 'application/x-amz-json-1.0', 'application/x-amz-json-1.1']);

const queryValueSchema = z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]);
const proxyResponseHeaderSchema = z.union([z.string(), z.array(z.string())]);

export const proxyMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const proxyPathSchema = z
    .string()
    .min(1)
    .max(8192)
    .startsWith('/')
    .refine((path) => !path.includes('#'), { message: 'URL fragments are not supported in proxy paths.' });

export const proxyQueryParamsSchema = z.record(z.string().min(1).max(255), queryValueSchema);

export const proxyHeadersSchema = z.record(z.string().min(1).max(255), z.string().max(8192));

export const mcpProxyResponseSchema = z
    .object({
        status: z.number().int(),
        headers: z.record(z.string(), proxyResponseHeaderSchema),
        body: z.json()
    })
    .strict();

export type ProxyQueryParams = z.infer<typeof proxyQueryParamsSchema>;
export type McpProxyResponse = z.infer<typeof mcpProxyResponseSchema>;

type ProxyResponseFormatErrorCode = 'response_too_large' | 'unsupported_response_body';

export class ProxyResponseFormatError extends Error {
    public readonly code: ProxyResponseFormatErrorCode;

    constructor(code: ProxyResponseFormatErrorCode, message: string) {
        super(message);
        this.name = 'ProxyResponseFormatError';
        this.code = code;
    }
}

export interface McpProxyRequest {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    integrationId: string;
    connectionId: string;
    method: HTTP_METHOD;
    path: string;
    queryParams?: ProxyQueryParams | undefined;
    headers?: Record<string, string> | undefined;
    body?: unknown;
    baseUrlOverride?: string | undefined;
    retries?: number | undefined;
    decompress?: boolean | undefined;
    retryOn?: number[] | undefined;
    forwardHeadersOnRedirect?: boolean | undefined;
}

/**
 * The single path every MCP proxy caller goes through, so credential handling, the outbound URL
 * policy, plan capping and the response size limit are enforced once rather than per tool.
 */
export async function executeMcpProxyRequest(params: McpProxyRequest): Promise<Result<McpProxyResponse>> {
    const { account, environment, integrationId, connectionId } = params;

    const execution = await proxyService.request({
        account,
        environment,
        plan: params.plan,
        method: params.method,
        endpoint: appendQueryParams(params.path, params.queryParams),
        integrationId,
        connectionId,
        headers: withDefaultJsonContentType(params.headers, params.body),
        body: serializeJsonBody(params.body),
        retries: params.retries,
        baseUrlOverride: params.baseUrlOverride,
        decompress: params.decompress,
        retryOn: params.retryOn,
        forwardHeadersOnRedirect: params.forwardHeadersOnRedirect
    });

    if (execution.result.isErr()) {
        return Err(proxyServiceErrorToMcp(execution.result.error));
    }

    const response = execution.result.value;
    try {
        const responseBody = await readProxyResponseBody(response);
        const output = proxyResponseToMcp(response, responseBody);
        egressTelemetryRecorder.record({
            accountId: account.id,
            environmentId: environment.id,
            environmentName: environment.name,
            integrationId,
            connectionId,
            callsite: 'proxy',
            egressedBytes: responseBody.length,
            count: 1
        });
        completeProxyResponse(response);
        return Ok(output);
    } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to format the provider response');
        void execution.logCtx?.error('Failed to format provider response for MCP', { error });
        completeProxyResponse(response, error);
        if (err instanceof ProxyResponseFormatError) {
            return Err(new PublicMcpError(err.message));
        }
        throw err;
    }
}

function completeProxyResponse(response: Pick<ProxyServiceResponse, 'complete'>, error?: Error): void {
    void response.complete(error).catch((err: unknown) => {
        const completionError = err instanceof Error ? err : new Error('Failed to complete MCP proxy response');
        logger.error('Failed to complete MCP proxy response', { error: completionError });
    });
}

// Axios treats falsy primitives as empty request bodies. Serialize MCP JSON primitives here so
// the shared proxy can sign, canonicalize, and send the exact JSON bytes supplied by the caller.
function serializeJsonBody(body: unknown): unknown {
    if (body === undefined || (body !== null && typeof body === 'object')) {
        return body;
    }
    return JSON.stringify(body);
}

function withDefaultJsonContentType(headers: Record<string, string> | undefined, body: unknown): Record<string, string> | undefined {
    if (body === undefined || Object.keys(headers ?? {}).some((name) => name.toLowerCase() === 'content-type')) {
        return headers;
    }
    return { ...headers, 'content-type': 'application/json' };
}

// Appends URL-encoded query parameters to the path, preserving existing parameters and serializing arrays as repeated keys.
function appendQueryParams(path: string, queryParams: ProxyQueryParams | undefined): string {
    if (!queryParams || Object.keys(queryParams).length === 0) {
        return path;
    }

    const separator = path.includes('?') ? '&' : '?';
    const searchParams = new URLSearchParams();
    for (const [name, value] of Object.entries(queryParams)) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
            searchParams.append(name, String(item));
        }
    }
    return `${path}${separator}${searchParams.toString()}`;
}

function proxyServiceErrorToMcp(error: ProxyServiceError): Error {
    const code = error.code;
    switch (code) {
        case 'base_url_override_disabled':
        case 'base_url_override_not_allowed':
        case 'plan_limit':
        case 'unknown_integration':
        case 'connection_not_found':
        case 'connection_refresh_backoff':
        case 'credentials_refresh_failed':
        case 'proxy_request_failed':
            return new PublicMcpError(error.message);
        case 'internal_error':
            return error;
        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected ProxyService error code while proxying request', { code: exhaustiveCheck });
            return new InternalMcpError();
        }
    }
}

async function readProxyResponseBody(response: ProxyServiceResponse): Promise<Buffer> {
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
            throw new ProxyResponseFormatError(
                'unsupported_response_body',
                'The provider returned an unsupported response body. Use the HTTP proxy for non-text responses.'
            );
        }

        bodyBytes += buffer.length;
        if (bodyBytes > MAX_MCP_PROXY_RESPONSE_BYTES) {
            body.destroy();
            throw new ProxyResponseFormatError(
                'response_too_large',
                `The provider response exceeds the ${MAX_MCP_PROXY_RESPONSE_SIZE_LABEL} MCP limit. Use the HTTP proxy for large responses.`
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
    return mediaType.startsWith('text/') || isJsonMediaType(mediaType) || mediaType.endsWith('+xml') || textualApplicationMediaTypes.has(mediaType);
}

function isJsonMediaType(mediaType: string): boolean {
    return jsonMediaTypes.has(mediaType) || mediaType.endsWith('+json');
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

function proxyResponseToMcp(response: ProxyServiceResponse, body: Buffer): McpProxyResponse {
    return {
        status: response.status,
        headers: formatHeaders(response.headers, response.wasCompressed),
        body: formatBody(body.toString('utf8'), getContentType(response.headers).mediaType)
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

function formatBody(body: string, mediaType: string): McpProxyResponse['body'] {
    if (isJsonMediaType(mediaType)) {
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
function normalizeLosslessJson(value: unknown): McpProxyResponse['body'] {
    if (isJsonBigNumber(value)) {
        const number = value.toNumber();
        return value.isInteger() && Number.isSafeInteger(number) ? number : value.toFixed();
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
