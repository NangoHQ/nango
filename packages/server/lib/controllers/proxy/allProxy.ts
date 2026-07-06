import { finished, PassThrough } from 'node:stream';

import { isAxiosError } from 'axios';
import * as z from 'zod';

import { logContextGetter, LogContextOrigin, OtlpSpan } from '@nangohq/logs';
import {
    configService,
    connectionService,
    enforceProxyOutboundUrlPolicy,
    errorManager,
    ErrorSourceEnum,
    findOutboundUrlError,
    getProvider,
    getProxyConfiguration,
    getServerOutboundUrlPolicy,
    LogActionEnum,
    makeDataTransferEvent,
    ProxyError,
    ProxyRequest,
    pubsub,
    refreshOrTestCredentials
} from '@nangohq/shared';
import { getHeaders, getLogger, isBaseUrlOverrideDenied, metrics, normalizeDenylist, redactHeaders, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../env.js';
import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { connectionRefreshFailed, connectionRefreshSuccess } from '../../hooks/hooks.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { egressTelemetryRecorder } from '../../utils/egressTelemetry.js';
import { capping } from '../../utils/usage.js';

import type { ServerEgressCallsite } from '../../utils/egressTelemetry.js';
import type { LogContext } from '@nangohq/logs';
import type { AllPublicProxy, HTTP_METHOD, InternalProxyConfiguration, ProxyFile } from '@nangohq/types';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { Request, Response } from 'express';
import type { OutgoingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';

type ForwardedHeaders = Record<string, string>;

const MEMOIZED_CONNECTION_TTL = 60000;

const logger = getLogger('Proxy.Controller');

const baseUrlOverrideDenylist = normalizeDenylist(envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST);

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

// Headers from provider responses that must not be forwarded to the client
const PROXY_RESPONSE_HEADER_DENYLIST = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'content-length'
]);

export function shouldForwardResponseHeader(header: string): boolean {
    const lowered = header.toLowerCase();
    // access-control-* is excluded because Nango sets its own CORS headers
    return !PROXY_RESPONSE_HEADER_DENYLIST.has(lowered) && !lowered.startsWith('access-control-');
}

export const allPublicProxy = asyncWrapper<AllPublicProxy>(async (req, res, next) => {
    const valHeaders = schemaHeaders.safeParse(req.headers);
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }
    const parsedHeaders = valHeaders.data satisfies AllPublicProxy['Headers'];
    const { environment, account, plan } = res.locals;

    const baseUrlOverride = parsedHeaders['base-url-override'];

    let logCtx: LogContext | undefined;

    const connectionId = parsedHeaders['connection-id'];
    const providerConfigKey = parsedHeaders['provider-config-key'];
    const retries = parsedHeaders['retries'];
    const decompress = parsedHeaders['decompress'] === 'true';
    const retryOn = parsedHeaders['retry-on'] ? parsedHeaders['retry-on'].split(',').map(Number) : null;
    const forwardHeadersOnRedirect =
        parsedHeaders['forward-headers-on-redirect'] !== undefined ? parsedHeaders['forward-headers-on-redirect'] === 'true' : undefined;
    const existingActivityLogId = parsedHeaders['nango-activity-log-id'];
    const isSync = parsedHeaders['nango-is-sync'] === 'true';
    const isDryRun = parsedHeaders['nango-is-dry-run'] === 'true';
    try {
        if (!isSync) {
            metrics.increment(metrics.Types.PROXY, 1, { accountId: account.id });
        }

        logCtx = existingActivityLogId
            ? logContextGetter.get({ id: String(existingActivityLogId), accountId: account.id })
            : await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment }, { dryRun: isDryRun });

        if (logCtx instanceof LogContextOrigin) {
            logCtx.attachSpan(new OtlpSpan(logCtx.operation));
        }

        if (baseUrlOverride && !envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED) {
            void logCtx.error('Base URL override is disabled by server configuration');
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
            res.status(400).send({
                error: {
                    code: 'base_url_override_disabled',
                    message: 'Base URL override is disabled by server configuration.'
                }
            });
            return;
        }
        if (baseUrlOverride && isBaseUrlOverrideDenied(baseUrlOverride, baseUrlOverrideDenylist)) {
            metrics.increment(metrics.Types.PROXY_BASE_URL_OVERRIDE_DENIED, 1, { accountId: account.id });
            void logCtx.error('Base URL override is not allowed by server configuration');
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
            res.status(400).send({
                error: {
                    code: 'base_url_override_not_allowed',
                    message: 'This base URL override is not allowed by server configuration.'
                }
            });
            return;
        }

        // capping
        const cappingStatus = await capping.getStatus(plan, 'proxy');
        if (cappingStatus.isCapped) {
            const message = cappingStatus.message || 'Your plan limits have been reached. Please upgrade your plan.';
            void logCtx.error(message, { cappingStatus });
            await logCtx.failed();
            res.status(402).send({ error: { code: 'plan_limit', message } });
            return;
        }

        const method = req.method.toUpperCase() as HTTP_METHOD;

        // contains the path and querystring
        const endpoint = req.originalUrl.replace(/^\/proxy\/?/, '/');

        const headers = parseHeaders(req);

        let files: ProxyFile[] = [];
        if (Array.isArray(req.files)) {
            files = req.files as ProxyFile[];
        }

        const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
        if (!integration) {
            void logCtx.error('Provider configuration not found');
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
            res.status(404).send({
                error: {
                    code: 'unknown_provider_config',
                    message: 'Provider config not found for the given provider config key. Please make sure the provider config exists in the Nango dashboard.'
                }
            });
            return;
        }

        // A base-url-override (already checked above) takes precedence over the integration's custom.baseUrl, so only
        // denylist-check custom.baseUrl when no override is supplied — otherwise a safe override would be wrongly rejected.
        const provider = getProvider(integration.provider);
        const customBaseUrl = !baseUrlOverride && provider?.integration_config ? integration.custom?.['baseUrl'] : undefined;
        if (customBaseUrl && !envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED) {
            void logCtx.error('Integration base URL override is disabled by server configuration');
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
            res.status(400).send({
                error: { code: 'base_url_override_disabled', message: 'Base URL override is disabled by server configuration.' }
            });
            return;
        }
        if (customBaseUrl && isBaseUrlOverrideDenied(customBaseUrl, baseUrlOverrideDenylist)) {
            void logCtx.error('Integration base URL is not allowed by server configuration');
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
            res.status(400).send({
                error: { code: 'base_url_override_not_allowed', message: 'This base URL is not allowed by server configuration.' }
            });
            return;
        }

        const connectionRes = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
        if (connectionRes.error || !connectionRes.response) {
            void logCtx.error('Failed to get connection', { error: connectionRes.error });
            await logCtx.failed();
            res.status(400).send({
                error: { code: 'server_error', message: `Failed to get connection` }
            });
            return;
        }

        const credentialResponse = await refreshOrTestCredentials({
            account,
            environment,
            connection: connectionRes.response,
            integration,
            logContextGetter,
            instantRefresh: false,
            onRefreshSuccess: connectionRefreshSuccess,
            onRefreshFailed: connectionRefreshFailed
        });
        if (credentialResponse.isErr()) {
            const err = credentialResponse.error;
            void logCtx.error('Failed to get connection credentials', { error: err });
            await logCtx.failed();
            if (err.type === 'connection_refresh_backoff') {
                res.status(err.status).send({ error: { code: err.type, message: err.message } });
            } else {
                metrics.increment(metrics.Types.PROXY_FAILURE);
                res.status(err.status).send({ error: { code: 'server_error', message: `Failed to get connection credentials: '${err.message}'` } });
            }
            return;
        }

        const { value: connection } = credentialResponse;

        await logCtx.enrichOperation({
            integrationId: integration.id!,
            integrationName: integration.unique_key,
            providerName: integration.provider,
            connectionId: connection.id,
            connectionName: connection.connection_id
        });

        const internalConfig: InternalProxyConfiguration = {
            providerName: integration.provider
        };

        let lastConnectionRefresh = Date.now();
        let freshConnection = connection;
        const proxy = new ProxyRequest({
            proxyConfig: getProxyConfiguration({
                externalConfig: {
                    endpoint,
                    providerConfigKey,
                    retries,
                    data: req.body,
                    files,
                    headers,
                    baseUrlOverride,
                    decompress,
                    method,
                    retryOn,
                    responseType: 'stream',
                    ...(forwardHeadersOnRedirect !== undefined ? { forwardHeadersOnRedirect } : {}),
                    ...(!envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED || baseUrlOverrideDenylist.size > 0
                        ? {
                              validateProxyRequestUrl: ({ absoluteUrl, proxyConfig, connection, integrationConfig }) => {
                                  enforceProxyOutboundUrlPolicy({
                                      absoluteUrl,
                                      proxyConfig,
                                      connection,
                                      ...(integrationConfig !== undefined ? { integrationConfig } : {}),
                                      overrideEnabled: envs.NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED,
                                      denylist: baseUrlOverrideDenylist
                                  });
                              },
                              validateProxyRedirectUrl: (absoluteUrl: string) => {
                                  if (isBaseUrlOverrideDenied(absoluteUrl, baseUrlOverrideDenylist)) {
                                      metrics.increment(metrics.Types.PROXY_BASE_URL_OVERRIDE_DENIED, 1, { accountId: account.id });
                                      let redirectHostForLog: string;
                                      try {
                                          redirectHostForLog = new URL(absoluteUrl).hostname;
                                      } catch {
                                          redirectHostForLog = 'unparseable';
                                      }
                                      logger.warning('Proxy redirect to denylisted host blocked', {
                                          accountId: account.id,
                                          providerConfigKey: parsedHeaders['provider-config-key'],
                                          connectionId: parsedHeaders['connection-id'],
                                          redirectHost: redirectHostForLog
                                      });
                                      throw new ProxyError('proxy_redirect_to_denied_host', 'This redirect target is not allowed by server configuration.');
                                  }
                              }
                          }
                        : {})
                },
                internalConfig
            }).unwrap(),
            outboundPolicy: getServerOutboundUrlPolicy(),
            logger: (msg) => {
                void logCtx?.log(msg);
            },
            getConnection: async () => {
                if (Date.now() - lastConnectionRefresh < MEMOIZED_CONNECTION_TTL) {
                    return freshConnection;
                }

                lastConnectionRefresh = Date.now();
                const credentialResponse = await refreshOrTestCredentials({
                    account,
                    environment,
                    connection,
                    integration,
                    logContextGetter,
                    instantRefresh: false,
                    onRefreshSuccess: connectionRefreshSuccess,
                    onRefreshFailed: connectionRefreshFailed
                });
                if (credentialResponse.isErr()) {
                    throw new ProxyError('failed_to_get_connection', 'Failed to get connection credentials', credentialResponse.error);
                }

                freshConnection = credentialResponse.value;
                return freshConnection;
            },
            getIntegrationConfig: () => ({
                oauth_client_id: integration.oauth_client_id,
                oauth_client_secret: integration.oauth_client_secret,
                custom: integration.custom
            }),
            onBytes: (meteredBytes) => {
                void pubsub.publisher.publish(
                    makeDataTransferEvent({
                        pkg: 'server',
                        callsite: 'proxy',
                        accountId: account.id,
                        connectionId: connection.connection_id,
                        integrationId: providerConfigKey,
                        environmentId: environment.id,
                        environmentName: environment.name,
                        meteredBytes
                    })
                );
            }
        });

        let success = false;
        const recordEgressedBytes = makeRecordEgressedBytes(req, account.id, environment.id, environment.name, providerConfigKey, connection.connection_id);

        try {
            const responseStream = (await proxy.request()).unwrap();
            await handleResponse({
                res,
                responseStream,
                logCtx,
                onEgressedBytes: recordEgressedBytes
            });
            success = true;
        } catch (err) {
            handleErrorResponse({
                res,
                error: err,
                requestConfig: proxy.axiosConfig,
                logCtx,
                onEgressedBytes: recordEgressedBytes
            });
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
        }

        void pubsub.publisher.publish({
            subject: 'usage',
            type: 'usage.proxy',
            idempotencyKey: logCtx.id,
            payload: {
                value: 1,
                properties: {
                    accountId: account.id,
                    environmentId: environment.id,
                    environmentName: environment.name,
                    integrationId: providerConfigKey,
                    connectionId: connection.connection_id,
                    success
                }
            }
        });
    } catch (err) {
        errorManager.report(err, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.PROXY,
            environmentId: environment.id,
            metadata: {
                connectionId,
                providerConfigKey
            }
        });
        if (logCtx) {
            void logCtx.error('uncaught error', { error: err });
            await logCtx.failed();
        }
        metrics.increment(metrics.Types.PROXY_FAILURE);
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

/**
 * Checks whether the response was compressed (`content-encoding` header was set) before axios processed it.
 */
function checkWasCompressed(responseStream: AxiosResponse): boolean | undefined {
    const contentEncoding = responseStream.headers['content-encoding'] || '';
    // if `content-encoding` header wasn't stripped by axios, the response is compressed
    if (contentEncoding) return true;

    const rawHeaders = responseStream.request?.res?.rawHeaders;
    // if raw headers are not available, we can't determine whether the response was compressed
    if (!rawHeaders || !Array.isArray(rawHeaders)) return undefined;

    const ceIdx = rawHeaders.findIndex((h: unknown) => typeof h === 'string' && h.toLowerCase() === 'content-encoding');
    // if `content-encoding` header is present in raw headers, the response was originally compressed and the header was stripped by axios
    return ceIdx !== -1 && ceIdx + 1 < rawHeaders.length && Boolean(rawHeaders[ceIdx + 1]);
}

const callsiteByMethod: Record<string, ServerEgressCallsite> = {
    GET: 'get_/proxy',
    POST: 'post_/proxy',
    PATCH: 'patch_/proxy',
    PUT: 'put_/proxy',
    DELETE: 'delete_/proxy'
};

function makeRecordEgressedBytes(req: Request, accountId: number, environmentId: number, environmentName: string, integrationId: string, connectionId: string) {
    return function (egressedBytes: number) {
        egressTelemetryRecorder.record({
            accountId,
            environmentId,
            environmentName,
            integrationId,
            connectionId,
            callsite: callsiteByMethod[req.method] ?? 'unknown_/proxy',
            egressedBytes,
            count: 1
        });
    };
}

export async function handleResponse({
    res,
    responseStream,
    logCtx,
    onEgressedBytes
}: {
    res: Response;
    responseStream: AxiosResponse;
    logCtx: LogContext;
    onEgressedBytes?: ((egressedBytes: number) => void) | undefined;
}) {
    const contentDisposition = responseStream.headers['content-disposition'] || '';
    const transferEncoding = responseStream.headers['transfer-encoding'] || '';

    const isChunked = transferEncoding === 'chunked';
    const isAttachmentOrInline = /^(attachment|inline)(;|\s|$)/i.test(contentDisposition);

    if (isChunked || isAttachmentOrInline) {
        const passthroughHeaders = Object.fromEntries(Object.entries(responseStream.headers)) as OutgoingHttpHeaders;
        if (checkWasCompressed(responseStream)) {
            // axios decompressed the response, so the `content-length` header is no longer valid
            delete passthroughHeaders['content-length'];
        }
        let egressedBytes = 0;
        const passThroughStream = new PassThrough();
        passThroughStream.on('data', (chunk: Buffer) => {
            egressedBytes += chunk.length;
        });
        const cleanup = finished(res, () => {
            onEgressedBytes?.(egressedBytes);
            cleanup();
        });
        responseStream.data.pipe(passThroughStream);
        passThroughStream.pipe(res);
        res.writeHead(responseStream.status, passthroughHeaders);

        metrics.increment(metrics.Types.PROXY_SUCCESS);
        await logCtx.success();
        return;
    }

    const responseData: Buffer[] = [];
    let responseLen = 0;

    responseStream.data.on('data', (chunk: Buffer) => {
        responseData.push(chunk);
        responseLen += chunk.length;
    });

    responseStream.data.on('end', async () => {
        if (responseLen > 5_000_000) {
            logger.info(`Response > 5MB: ${responseLen} bytes`);
        }

        if (responseStream.status === 204) {
            res.status(204).end();
            onEgressedBytes?.(0);
            metrics.increment(metrics.Types.PROXY_SUCCESS);
            await logCtx.success();
            return;
        }

        for (const [header, value] of Object.entries(responseStream.headers)) {
            if (!shouldForwardResponseHeader(header)) {
                continue;
            }
            if ((typeof value === 'string' && value !== '') || typeof value === 'number' || Array.isArray(value)) {
                res.setHeader(header, value);
            }
        }

        try {
            res.send(Buffer.concat(responseData));
            onEgressedBytes?.(responseLen);
        } catch (err) {
            void logCtx.error('Failed to write response', { error: err });
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
            return;
        }

        await logCtx.success();
        metrics.increment(metrics.Types.PROXY_SUCCESS);
    });
}

function proxyErrorFromErrorChain(error: unknown): ProxyError | null {
    let current: unknown = error;
    const seen = new Set<unknown>();
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current);
        if (current instanceof ProxyError) {
            return current;
        }
        if ('cause' in current && (current as { cause?: unknown }).cause !== undefined) {
            current = (current as { cause: unknown }).cause;
        } else {
            break;
        }
    }
    return null;
}

export function handleErrorResponse({
    res,
    error,
    requestConfig,
    logCtx,
    onEgressedBytes
}: {
    res: Response;
    error: unknown;
    requestConfig?: AxiosRequestConfig | undefined;
    logCtx: LogContext;
    onEgressedBytes?: ((egressedBytes: number) => void) | undefined;
}) {
    const countBytes = (body: Record<string, unknown>): number => {
        return Buffer.byteLength(JSON.stringify(body));
    };

    const proxyErr = proxyErrorFromErrorChain(error);
    if (proxyErr?.code === 'proxy_redirect_to_denied_host') {
        void logCtx.error('Proxy redirect denied by denylist', { error: proxyErr });
        const body = {
            error: {
                code: 'base_url_override_not_allowed',
                message: 'This base URL override is not allowed by server configuration.'
            }
        };
        res.status(400).send(body);
        onEgressedBytes?.(countBytes(body));
        return;
    }

    const outboundErr = findOutboundUrlError(error);
    if (outboundErr) {
        void logCtx.error('Proxy outbound URL denied by policy', { error: outboundErr });
        const body = {
            error: {
                code: 'base_url_override_not_allowed',
                message: 'This outbound URL is not allowed by server configuration.'
            }
        };
        res.status(400).send(body);
        onEgressedBytes?.(countBytes(body));
        return;
    }

    if (!isAxiosError(error)) {
        if (error instanceof ProxyError) {
            void logCtx.error('Unknown error', { error });
            const body = {
                error: { code: error.code, message: error.message }
            };
            res.status(400).send(body);
            onEgressedBytes?.(countBytes(body));
            return;
        }

        void logCtx.error('Unknown error', { error });
        res.status(500).send();
        onEgressedBytes?.(0);
        return;
    }

    if (!error.response?.data && error.toJSON) {
        const {
            message,
            stack,
            config: { method },
            code,
            status
        } = error.toJSON() as any;

        const errorObject = { message, stack, code, status, url: requestConfig?.url, method };

        const responseStatus = error.response?.status || 500;
        const responseHeaders = error.response?.headers || {};

        res.status(responseStatus).set(responseHeaders).send(errorObject);
        onEgressedBytes?.(countBytes(errorObject));

        return;
    }

    const errorStream = error.response?.data as Readable;
    if (errorStream) {
        const chunks: Buffer[] = [];
        errorStream.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
        });
        errorStream.on('error', (err) => {
            void logCtx.error('Error reading upstream error stream', { error: err });
            res.status(500).send();
            onEgressedBytes?.(0);
        });
        errorStream.on('end', () => {
            const buffer = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
            const data = buffer.toString();
            let parsedBody: string | Record<string, string> = data;
            const contentTypeHeader = error.response?.headers?.['content-type'];
            const contentType =
                typeof contentTypeHeader === 'string' ? contentTypeHeader : Array.isArray(contentTypeHeader) ? contentTypeHeader.join(', ') : '';
            if (contentType.includes('application/json')) {
                try {
                    parsedBody = JSON.parse(data);
                } catch {
                    // Intentionally left blank - parsedBody stays string
                }
            }

            const responseStatus = error.response?.status || 500;
            const responseHeaders = { ...error.response?.headers };
            delete (responseHeaders as Record<string, unknown>)['transfer-encoding'];
            void logCtx.error('Failed with this body', { body: parsedBody });

            res.status(responseStatus).set(responseHeaders).send(data);
            onEgressedBytes?.(buffer.length);
        });
    }
}
