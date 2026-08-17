import { finished, PassThrough } from 'node:stream';

import * as z from 'zod';

import { getFlags } from '@nangohq/feature-flags';
import { getHeaders, getLogger, metrics, redactHeaders, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import proxyService from '../../services/proxy.service.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type { ProxyServiceError, ProxyServiceResponse } from '../../services/proxy.service.js';
import type { LogContext } from '@nangohq/logs';
import type { AllPublicProxy, HTTP_METHOD, ProxyFile } from '@nangohq/types';
import type { Request, Response } from 'express';
import type { OutgoingHttpHeaders } from 'node:http';

type ForwardedHeaders = Record<string, string>;

const logger = getLogger('Proxy.Controller');

const schemaHeaders = z.object({
    'provider-config-key': providerConfigKeySchema,
    'connection-id': connectionIdSchema,
    retries: z.coerce.number().optional().default(0),
    'base-url-override': z.url().or(z.literal('')).optional(),
    decompress: z.enum(['true', 'false']).optional(),
    'retry-on': z
        .string()
        .regex(/^\d+(,\d+)*$/)
        .optional(),
    'forward-headers-on-redirect': z.enum(['true', 'false']).optional(),
    'nango-activity-log-id': z.string().max(255).optional(),
    'nango-is-sync': z.enum(['true', 'false']).optional(),
    'nango-is-dry-run': z.enum(['true', 'false']).optional()
});

// Legacy buffered-path allowlist used when proxy-forward-all-response-headers is off.
const PROXY_RESPONSE_HEADER_ALLOWLIST = new Set([
    'content-type',
    'mcp-session-id', // MCP RFC — https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#session-management
    'x-request-id',
    'x-correlation-id'
]);

// Headers from provider responses that must not be forwarded to the client.
// content-length is handled per path via allowContentLength (stripped on buffered/error, optionally kept on stream).
const PROXY_RESPONSE_HEADER_DENYLIST = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
]);

type ForwardableHeaderValue = string | number | string[];

export function shouldForwardResponseHeader(header: string, value: unknown, options?: { allowContentLength?: boolean }): value is ForwardableHeaderValue {
    if (value == null || value === '') {
        return false;
    }
    if (!(typeof value === 'string' || typeof value === 'number' || Array.isArray(value))) {
        return false;
    }

    const lowered = header.toLowerCase();
    if (lowered === 'content-length') {
        return options?.allowContentLength === true;
    }
    // access-control-* is excluded because Nango sets its own CORS headers
    return !PROXY_RESPONSE_HEADER_DENYLIST.has(lowered) && !lowered.startsWith('access-control-');
}

export function filterProxyResponseHeaders(headers: Record<string, unknown> | object, options?: { allowContentLength?: boolean }): OutgoingHttpHeaders {
    const filtered: OutgoingHttpHeaders = {};
    for (const [header, value] of Object.entries(headers)) {
        if (shouldForwardResponseHeader(header, value, options)) {
            filtered[header] = value;
        }
    }
    return filtered;
}

function applyAllowlistedResponseHeaders(res: Response, headers: Record<string, unknown> | object) {
    for (const header of PROXY_RESPONSE_HEADER_ALLOWLIST) {
        const value = (headers as Record<string, unknown>)[header];
        if (typeof value === 'string' && value !== '') {
            res.setHeader(header, value);
        }
    }
}

function applyFilteredResponseHeaders(res: Response, headers: Record<string, unknown> | object, options?: { allowContentLength?: boolean }) {
    for (const [header, value] of Object.entries(headers)) {
        if (shouldForwardResponseHeader(header, value, options)) {
            res.setHeader(header, value);
        }
    }
}

export const allPublicProxy = asyncWrapperWithEnvironment<AllPublicProxy>(async (req, res, next) => {
    const valHeaders = schemaHeaders.safeParse(req.headers);
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }
    const parsedHeaders = valHeaders.data satisfies AllPublicProxy['Headers'];
    const { environment, account, plan } = res.locals;
    let logCtx: LogContext | undefined;
    try {
        const method = req.method.toUpperCase() as HTTP_METHOD;
        const endpoint = req.originalUrl.replace(/^\/proxy\/?/, '/');
        let files: ProxyFile[] = [];
        if (Array.isArray(req.files)) {
            files = req.files as ProxyFile[];
        }

        const execution = await proxyService.request({
            account,
            environment,
            plan,
            method,
            endpoint,
            integrationId: parsedHeaders['provider-config-key'],
            connectionId: parsedHeaders['connection-id'],
            headers: parseHeaders(req),
            body: req.body,
            files,
            retries: parsedHeaders.retries,
            baseUrlOverride: parsedHeaders['base-url-override'],
            decompress: parsedHeaders.decompress === 'true',
            retryOn: parsedHeaders['retry-on'] ? parsedHeaders['retry-on'].split(',').map(Number) : null,
            ...(parsedHeaders['forward-headers-on-redirect'] !== undefined
                ? { forwardHeadersOnRedirect: parsedHeaders['forward-headers-on-redirect'] === 'true' }
                : {}),
            activityLogId: parsedHeaders['nango-activity-log-id'],
            isSync: parsedHeaders['nango-is-sync'] === 'true',
            isDryRun: parsedHeaders['nango-is-dry-run'] === 'true'
        });
        logCtx = execution.logCtx;
        if (execution.result.isErr()) {
            if (execution.result.error.code === 'internal_error') {
                next(execution.result.error.cause ?? execution.result.error);
                return;
            }
            handleProxyServiceErrorResponse(res, execution.result.error);
            return;
        }

        if (!logCtx) {
            next(new Error('Proxy service did not create a log context'));
            return;
        }
        const forwardAllResponseHeaders = await getFlags().shouldForwardAllProxyResponseHeaders(account.uuid);
        if (execution.result.value.outcome === 'success') {
            handleResponse({
                res,
                responseStream: execution.result.value,
                logCtx,
                forwardAllResponseHeaders
            });
        } else {
            handleUpstreamErrorResponse({
                res,
                responseStream: execution.result.value,
                logCtx,
                forwardAllResponseHeaders
            });
        }
    } catch (err) {
        next(err);
    } finally {
        const reqHeaders = getHeaders(req.headers);
        await logCtx?.enrichOperation({
            request: {
                url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
                method: req.method,
                headers: redactHeaders({ headers: reqHeaders })
            },
            response: {
                code: res.statusCode,
                headers: redactHeaders({ headers: getHeaders(res.getHeaders()) })
            }
        });
    }
});

/**
 * Parse Headers
 */
export function parseHeaders(req: Pick<Request, 'rawHeaders'>) {
    const headers = req.rawHeaders;
    const HEADER_PROXY_LOWER = 'nango-proxy-';
    const HEADER_PROXY_UPPER = 'Nango-Proxy-';
    const forwardedHeaders: ForwardedHeaders = {};

    if (!headers) {
        return forwardedHeaders;
    }

    for (let i = 0, n = headers.length; i < n; i += 2) {
        const headerKey = headers[i];

        if (headerKey?.toLowerCase().startsWith(HEADER_PROXY_LOWER) || headerKey?.startsWith(HEADER_PROXY_UPPER)) {
            forwardedHeaders[headerKey.slice(HEADER_PROXY_LOWER.length)] = headers[i + 1] || '';
        }
    }

    return forwardedHeaders;
}

export function handleResponse({
    res,
    responseStream,
    logCtx,
    forwardAllResponseHeaders = false
}: {
    res: Response;
    responseStream: Pick<ProxyServiceResponse, 'status' | 'headers' | 'body' | 'wasCompressed'>;
    logCtx: LogContext;
    forwardAllResponseHeaders?: boolean;
}) {
    const contentDisposition = headerToString(responseStream.headers['content-disposition']);
    const transferEncoding = headerToString(responseStream.headers['transfer-encoding']);

    const isChunked = transferEncoding === 'chunked';
    const isAttachmentOrInline = /^(attachment|inline)(;|\s|$)/i.test(contentDisposition);

    if (isChunked || isAttachmentOrInline) {
        const passthroughHeaders = forwardAllResponseHeaders
            ? filterProxyResponseHeaders(responseStream.headers, { allowContentLength: true })
            : (Object.fromEntries(Object.entries(responseStream.headers)) as OutgoingHttpHeaders);
        if (responseStream.wasCompressed) {
            // axios decompressed the response, so the `content-length` header is no longer valid
            delete passthroughHeaders['content-length'];
        }
        const passThroughStream = new PassThrough();
        const cleanup = finished(res, () => {
            cleanup();
        });
        responseStream.body.pipe(passThroughStream);
        passThroughStream.pipe(res);
        res.writeHead(responseStream.status, passthroughHeaders);
        return;
    }

    const responseData: Buffer[] = [];
    let responseLen = 0;

    responseStream.body.on('data', (chunk: Buffer) => {
        responseData.push(chunk);
        responseLen += chunk.length;
    });

    const sendBufferedResponse = async () => {
        if (responseLen > 5_000_000) {
            logger.info(`Response > 5MB: ${responseLen} bytes`);
        }

        if (responseStream.status === 204) {
            if (forwardAllResponseHeaders) {
                applyFilteredResponseHeaders(res, responseStream.headers);
            }
            res.status(204).end();
            return;
        }

        if (forwardAllResponseHeaders) {
            applyFilteredResponseHeaders(res, responseStream.headers);
        } else {
            applyAllowlistedResponseHeaders(res, responseStream.headers);
        }

        try {
            res.send(Buffer.concat(responseData));
        } catch (err) {
            void logCtx.error('Failed to write response', { error: err });
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
            return;
        }
    };
    responseStream.body.on('end', () => {
        void sendBufferedResponse();
    });
}

export function handleUpstreamErrorResponse({
    res,
    responseStream,
    logCtx,
    forwardAllResponseHeaders = false
}: {
    res: Response;
    responseStream: Pick<ProxyServiceResponse, 'status' | 'headers' | 'body'>;
    logCtx: LogContext;
    forwardAllResponseHeaders?: boolean;
}): void {
    const chunks: Buffer[] = [];
    responseStream.body.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
    });
    responseStream.body.on('error', (err) => {
        void logCtx.error('Error reading upstream error stream', { error: err });
        res.status(500).send();
    });
    responseStream.body.on('end', () => {
        const buffer = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
        const data = buffer.toString();
        let parsedBody: unknown = data;
        if (headerToString(responseStream.headers['content-type']).includes('application/json')) {
            try {
                parsedBody = JSON.parse(data);
            } catch {
                // Keep the provider's original response body when it is invalid JSON.
            }
        }

        const responseHeaders = forwardAllResponseHeaders ? filterProxyResponseHeaders(responseStream.headers) : { ...responseStream.headers };
        if (!forwardAllResponseHeaders) {
            delete responseHeaders['transfer-encoding'];
        }
        void logCtx.error('Failed with this body', { body: parsedBody });
        res.status(responseStream.status).set(responseHeaders).send(data);
    });
}

export function handleProxyServiceErrorResponse(res: Response, error: ProxyServiceError): void {
    switch (error.code) {
        case 'unknown_integration':
            res.status(error.status).send({ error: { code: 'unknown_provider_config', message: error.message } });
            return;
        case 'connection_not_found':
        case 'credentials_refresh_failed':
            res.status(error.status).send({ error: { code: 'server_error', message: error.message } });
            return;
        case 'connection_refresh_backoff':
            res.status(error.status).send({ error: { code: 'connection_refresh_backoff', message: error.message } });
            return;
        case 'proxy_request_failed':
            res.status(error.status).send({ error: { code: error.providerCode ?? error.code, message: error.message } });
            return;
        case 'base_url_override_disabled':
        case 'base_url_override_not_allowed':
        case 'plan_limit':
            res.status(error.status).send({ error: { code: error.code, message: error.message } });
            return;
        case 'internal_error':
            res.status(500).send();
    }
}

function headerToString(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    return Array.isArray(value) ? value.join(', ') : '';
}
