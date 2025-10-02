import { PassThrough, Readable, Transform } from 'node:stream';

import { isAxiosError } from 'axios';
import * as z from 'zod';

import { LogContextOrigin, OtlpSpan, logContextGetter } from '@nangohq/logs';
import {
    ErrorSourceEnum,
    LogActionEnum,
    ProxyError,
    ProxyRequest,
    configService,
    connectionService,
    errorManager,
    getProxyConfiguration,
    refreshOrTestCredentials
} from '@nangohq/shared';
import { getHeaders, getLogger, metrics, redactHeaders, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { connectionRefreshFailed, connectionRefreshSuccess } from '../../hooks/hooks.js';
import { pubsub } from '../../pubsub.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { featureFlags } from '../../utils/utils.js';

import type { LogContext } from '@nangohq/logs';
import type { AllPublicProxy, HTTP_METHOD, InternalProxyConfiguration, ProxyFile } from '@nangohq/types';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { Request, Response } from 'express';
import type { OutgoingHttpHeaders } from 'node:http';
import type { TransformCallback } from 'node:stream';

type ForwardedHeaders = Record<string, string>;

const MEMOIZED_CONNECTION_TTL = 60000;

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
    'nango-activity-log-id': z.string().max(255).optional(),
    'nango-is-sync': z.enum(['true', 'false']).optional(),
    'nango-is-dry-run': z.enum(['true', 'false']).optional()
});

export const allPublicProxy = asyncWrapper<AllPublicProxy>(async (req, res, next) => {
    const valHeaders = schemaHeaders.safeParse(req.headers);
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    const { environment, account } = res.locals;

    metrics.increment(metrics.Types.PROXY_INCOMING_PAYLOAD_SIZE_BYTES, req.rawBody ? Buffer.byteLength(req.rawBody) : 0, { accountId: account.id });

    let logCtx: LogContext | undefined;
    const parsedHeaders = valHeaders.data satisfies AllPublicProxy['Headers'];

    const connectionId = parsedHeaders['connection-id'];
    const providerConfigKey = parsedHeaders['provider-config-key'];
    const retries = parsedHeaders['retries'];
    const baseUrlOverride = parsedHeaders['base-url-override'];
    const decompress = parsedHeaders['decompress'] === 'true';
    const retryOn = parsedHeaders['retry-on'] ? parsedHeaders['retry-on'].split(',').map(Number) : null;
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

        const method = req.method.toUpperCase() as HTTP_METHOD;

        // contains the path and querystring
        const endpoint = req.originalUrl.replace(/^\/proxy\//, '/');

        const headers = parseHeaders(req);

        const rawBodyFlag = await featureFlags.isSet('proxy:rawbody');
        const data: unknown = rawBodyFlag ? req.rawBody : req.body;
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
            void logCtx.error('Failed to get connection credentials', { error: credentialResponse.error });
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
            res.status(400).send({
                error: { code: 'server_error', message: `Failed to get connection credentials: '${credentialResponse.error.message}'` }
            });
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
                    data,
                    files,
                    headers,
                    baseUrlOverride,
                    decompress,
                    method,
                    retryOn,
                    responseType: 'stream'
                },
                internalConfig
            }).unwrap(),
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
            }
        });

        let success = false;
        try {
            const responseStream = (await proxy.request()).unwrap();
            await handleResponse({ res, responseStream, logCtx });
            success = true;
        } catch (err) {
            handleErrorResponse({ res, error: err, requestConfig: proxy.axiosConfig, logCtx });
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
                    connectionId: connection.id,
                    environmentId: connection.environment_id,
                    provider: integration.provider,
                    providerConfigKey,
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

async function handleResponse({ res, responseStream, logCtx }: { res: Response; responseStream: AxiosResponse; logCtx: LogContext }) {
    const contentType = responseStream.headers['content-type'] || '';
    const contentDisposition = responseStream.headers['content-disposition'] || '';
    const transferEncoding = responseStream.headers['transfer-encoding'] || '';
    const contentEncoding = responseStream.headers['content-encoding'] || '';

    const isJsonResponse = contentType.includes('application/json');
    const isChunked = transferEncoding === 'chunked';
    const isEncoded = Boolean(contentEncoding);
    const isAttachmentOrInline = /^(attachment|inline)(;|\s|$)/i.test(contentDisposition);

    if (isChunked || isEncoded || isAttachmentOrInline) {
        const passThroughStream = new PassThrough();
        responseStream.data.pipe(passThroughStream);
        passThroughStream.pipe(res);
        res.writeHead(responseStream.status, responseStream.headers as OutgoingHttpHeaders);

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
            metrics.increment(metrics.Types.PROXY_SUCCESS);
            await logCtx.success();
            return;
        }

        if (!isJsonResponse) {
            res.send(Buffer.concat(responseData));
            await logCtx.success();
            metrics.increment(metrics.Types.PROXY_SUCCESS);
            return;
        }

        try {
            const parsedResponse = JSON.parse(Buffer.concat(responseData).toString());

            res.json(parsedResponse);
            metrics.increment(metrics.Types.PROXY_SUCCESS);
            await logCtx.success();
        } catch (err) {
            logger.error(err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to parse JSON response' }));

            void logCtx.error('Failed to parse JSON response', { error: err });
            await logCtx.failed();
            metrics.increment(metrics.Types.PROXY_FAILURE);
        } finally {
            metrics.increment(metrics.Types.PROXY_OUTGOING_PAYLOAD_SIZE_BYTES, responseLen, { accountId: logCtx.accountId });
        }
    });
}

function handleErrorResponse({
    res,
    error,
    requestConfig,
    logCtx
}: {
    res: Response;
    error: unknown;
    requestConfig?: AxiosRequestConfig | undefined;
    logCtx: LogContext;
}) {
    if (!isAxiosError(error)) {
        if (error instanceof ProxyError) {
            void logCtx.error('Unknown error', { error });
            res.status(400).send({
                error: { code: error.code, message: error.message }
            });
            return;
        }

        void logCtx.error('Unknown error', { error });
        res.status(500).send();
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

        res.writeHead(responseStatus, responseHeaders as OutgoingHttpHeaders);

        const stream = new Readable();
        stream.push(JSON.stringify(errorObject));
        stream.push(null);

        stream.pipe(res);

        return;
    }

    const errorData = error.response?.data as Readable;
    const stringify = new Transform({
        transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
            callback(null, chunk);
        }
    });
    if (error.response?.status) {
        res.writeHead(error.response.status, error.response.headers as OutgoingHttpHeaders);
    }
    if (errorData) {
        const chunks: Buffer[] = [];
        errorData.pipe(stringify).pipe(res);
        stringify.on('data', (data) => {
            chunks.push(data);
        });
        stringify.on('end', () => {
            const data = chunks.length > 0 ? Buffer.concat(chunks).toString() : '';
            let errorData: string | Record<string, string> = data;
            if (error.response?.headers?.['content-type']?.includes('application/json')) {
                try {
                    errorData = JSON.parse(data);
                } catch {
                    // Intentionally left blank - errorData will be a string
                }
            }

            metrics.increment(metrics.Types.PROXY_OUTGOING_PAYLOAD_SIZE_BYTES, Buffer.byteLength(data), { accountId: logCtx.accountId });

            void logCtx.error('Failed with this body', { body: errorData });
        });
    }
}
