import type { Request, Response, NextFunction } from 'express';
import type { OutgoingHttpHeaders } from 'http';
import type { TransformCallback } from 'stream';
import type stream from 'stream';
import { Readable, Transform, PassThrough } from 'stream';
import type { UrlWithParsedQuery } from 'url';
import url from 'url';
import querystring from 'querystring';
import { isAxiosError } from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import {
    LogActionEnum,
    errorManager,
    ErrorSourceEnum,
    connectionService,
    configService,
    getProxyConfiguration,
    ProxyRequest,
    ProxyError,
    refreshOrTestCredentials
} from '@nangohq/shared';
import { metrics, getLogger, getHeaders, redactHeaders } from '@nangohq/utils';
import { logContextGetter, LogContextOrigin, OtlpSpan } from '@nangohq/logs';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../hooks/hooks.js';
import type { LogContext } from '@nangohq/logs';
import type { RequestLocals } from '../utils/express.js';
import type { HTTP_METHOD, InternalProxyConfiguration, ProxyFile } from '@nangohq/types';
import { featureFlags } from '../utils/utils.js';

type ForwardedHeaders = Record<string, string>;

const logger = getLogger('Proxy.Controller');

const MEMOIZED_CONNECTION_TTL = 60000;

class ProxyController {
    /**
     * Route Call
     * @desc Parse incoming request from the SDK or HTTP request and route the
     * call on the provided method after verifying the necessary parameters are set.
     * @param {Request} req Express request object
     * @param {Response} res Express response object
     * @param {NextFunction} next callback function to pass control to the next middleware function in the pipeline.
     */
    public async routeCall(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { environment, account } = res.locals;

        let logCtx: LogContext | undefined;
        const connectionId = req.get('Connection-Id') || '';
        const providerConfigKey = req.get('Provider-Config-Key') || '';
        try {
            const retries = req.get('Retries') as string;
            const baseUrlOverride = req.get('Base-Url-Override') as string;
            const decompress = req.get('Decompress') as string;
            const isSync = (req.get('Nango-Is-Sync') as string) === 'true';
            const isDryRun = (req.get('Nango-Is-Dry-Run') as string) === 'true';
            const retryOn = req.get('Retry-On') ? (req.get('Retry-On') as string).split(',').map(Number) : null;
            const existingActivityLogId = req.get('Nango-Activity-Log-Id') as string;

            if (!isSync) {
                metrics.increment(metrics.Types.PROXY, 1, { accountId: account.id });
            }

            logCtx = existingActivityLogId
                ? await logContextGetter.get({ id: String(existingActivityLogId), accountId: account.id })
                : await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment }, { dryRun: isDryRun });

            if (logCtx instanceof LogContextOrigin) {
                logCtx.attachSpan(new OtlpSpan(logCtx.operation));
            }

            const { method } = req;

            const path = req.params[0] as string;
            const { query }: UrlWithParsedQuery = url.parse(req.url, true) as unknown as UrlWithParsedQuery;
            const queryString = querystring.stringify(query);
            const endpoint = `${path}${queryString ? `?${queryString}` : ''}`;

            const headers = parseHeaders(req);

            const rawBodyFlag = await featureFlags.isSet('proxy:rawbody');
            const data = rawBodyFlag ? req.rawBody : req.body;
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
                        message:
                            'Provider config not found for the given provider config key. Please make sure the provider config exists in the Nango dashboard.'
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
                onRefreshSuccess: connectionRefreshSuccessHook,
                onRefreshFailed: connectionRefreshFailedHook
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
                        retries: retries ? Number(retries) : 0,
                        data,
                        files,
                        headers,
                        baseUrlOverride,
                        decompress: decompress === 'true' ? true : false,
                        method: method.toUpperCase() as HTTP_METHOD,
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
                        onRefreshSuccess: connectionRefreshSuccessHook,
                        onRefreshFailed: connectionRefreshFailedHook
                    });
                    if (credentialResponse.isErr()) {
                        throw new ProxyError('failed_to_get_connection', 'Failed to get connection credentials', connectionRes.error);
                    }

                    freshConnection = credentialResponse.value;
                    return freshConnection;
                }
            });

            try {
                const responseStream = (await proxy.request()).unwrap();
                await this.handleResponse({ res, responseStream, logCtx });
            } catch (err) {
                this.handleErrorResponse({ res, error: err, requestConfig: proxy.axiosConfig, logCtx });
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE);
            }
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
    }

    private async handleResponse({ res, responseStream, logCtx }: { res: Response; responseStream: AxiosResponse; logCtx: LogContext }) {
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
            }
        });
    }

    private handleErrorResponse({
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

        const errorData = error.response?.data as stream.Readable;
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
                void logCtx.error('Failed with this body', { body: errorData });
            });
        }
    }
}

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

export default new ProxyController();
