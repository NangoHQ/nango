import type { Request, Response, NextFunction } from 'express';
import type { OutgoingHttpHeaders } from 'http';
import type { TransformCallback } from 'stream';
import type stream from 'stream';
import { Readable, Transform, PassThrough } from 'stream';
import type { UrlWithParsedQuery } from 'url';
import url from 'url';
import querystring from 'querystring';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { backOff } from 'exponential-backoff';
import type { HTTP_METHOD, UserProvidedProxyConfiguration, InternalProxyConfiguration, ApplicationConstructedProxyConfiguration, File } from '@nangohq/shared';
import { LogActionEnum, errorManager, ErrorSourceEnum, proxyService, connectionService, configService, featureFlags } from '@nangohq/shared';
import { metrics, getLogger, axiosInstance as axios, getHeaders, redactHeaders, redactURL } from '@nangohq/utils';
import { flushLogsBuffer, logContextGetter } from '@nangohq/logs';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../hooks/hooks.js';
import type { LogContext } from '@nangohq/logs';
import type { RequestLocals } from '../utils/express.js';
import type { MessageRowInsert } from '@nangohq/types';

type ForwardedHeaders = Record<string, string>;

const logger = getLogger('Proxy.Controller');

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
        try {
            const connectionId = req.get('Connection-Id') || '';
            const providerConfigKey = req.get('Provider-Config-Key') || '';
            const retries = req.get('Retries') as string;
            const baseUrlOverride = req.get('Base-Url-Override') as string;
            const decompress = req.get('Decompress') as string;
            const isDebug = (req.get('Debug') as string) === 'true';
            const isSync = (req.get('Nango-Is-Sync') as string) === 'true';
            const isDryRun = (req.get('Nango-Is-Dry-Run') as string) === 'true';
            const retryOn = req.get('Retry-On') ? (req.get('Retry-On') as string).split(',').map(Number) : null;
            const existingActivityLogId = req.get('Nango-Activity-Log-Id') as string;

            if (!isSync) {
                metrics.increment(metrics.Types.PROXY, 1, { accountId: account.id });
            }

            logCtx = existingActivityLogId
                ? await logContextGetter.get({ id: String(existingActivityLogId) })
                : await logContextGetter.create({ operation: { type: 'proxy', action: 'call' } }, { account, environment }, { dryRun: isDryRun });

            const { method } = req;

            const path = req.params[0] as string;
            const { query }: UrlWithParsedQuery = url.parse(req.url, true) as unknown as UrlWithParsedQuery;
            const queryString = querystring.stringify(query);
            const endpoint = `${path}${queryString ? `?${queryString}` : ''}`;

            const headers = parseHeaders(req);

            const rawBodyFlag = await featureFlags.isEnabled('proxy:rawbody', 'global', false);
            const data = rawBodyFlag ? req.rawBody : req.body;
            let files: File[] = [];
            if (Array.isArray(req.files)) {
                files = req.files as File[];
            }

            const externalConfig: UserProvidedProxyConfiguration = {
                endpoint,
                providerConfigKey,
                connectionId,
                retries: retries ? Number(retries) : 0,
                data,
                files,
                headers,
                baseUrlOverride,
                decompress: decompress === 'true' ? true : false,
                method: method.toUpperCase() as HTTP_METHOD,
                retryOn
            };

            const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
            if (!integration) {
                await logCtx.error('Provider configuration not found');
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
                await logCtx.error('Failed to get connection', { error: connectionRes.error });
                await logCtx.failed();
                errorManager.errResFromNangoErr(res, connectionRes.error);
                return;
            }

            const credentialResponse = await connectionService.refreshOrTestCredentials({
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
                await logCtx.error('Failed to get connection credentials', { error: credentialResponse.error });
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
                connectionId: connection.id!,
                connectionName: connection.connection_id
            });

            const internalConfig: InternalProxyConfiguration = {
                existingActivityLogId: logCtx.id,
                connection,
                providerName: integration.provider
            };

            const { success, error, response: proxyConfig, logs } = proxyService.configure(externalConfig, internalConfig);

            await flushLogsBuffer(logs, logCtx);

            if (!success || !proxyConfig || error) {
                errorManager.errResFromNangoErr(res, error);
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE);
                res.status(400).send({ error: { code: 'server_error', message: 'failed to configure proxy' } });
                return;
            }

            await this.sendToHttpMethod({ res, method: method as HTTP_METHOD, configBody: proxyConfig, logCtx, isDebug });
        } catch (err) {
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

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
                await logCtx.error('uncaught error', { error: err });
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
                    headers: getHeaders(res.getHeaders())
                }
            });
        }
    }

    /**
     * Send to http method
     */
    private sendToHttpMethod({
        res,
        method,
        configBody,
        logCtx,
        isDebug
    }: {
        res: Response;
        method: HTTP_METHOD;
        configBody: ApplicationConstructedProxyConfiguration;
        logCtx: LogContext;
        isDebug: boolean;
    }) {
        const url = proxyService.constructUrl(configBody);
        let decompress = false;

        if (configBody.decompress === true || configBody.provider.proxy?.decompress === true) {
            decompress = true;
        }

        return this.request({
            res,
            method,
            url,
            config: configBody,
            decompress,
            data: configBody.data,
            logCtx,
            isDebug
        });
    }

    private async handleResponse({
        res,
        responseStream,
        requestConfig,
        config,
        logCtx
    }: {
        res: Response;
        responseStream: AxiosResponse;
        config: ApplicationConstructedProxyConfiguration;
        requestConfig: AxiosRequestConfig;
        logCtx: LogContext;
    }) {
        const valuesToFilter = Object.values(config.connection.credentials);
        const safeHeaders = redactHeaders({ headers: requestConfig.headers, valuesToFilter });
        const redactedURL = redactURL({ url: requestConfig.url!, valuesToFilter });
        await logCtx.http(`${config.method} ${redactedURL} was successful`, {
            request: {
                method: config.method,
                url: redactedURL,
                headers: safeHeaders
            },
            response: {
                code: responseStream.status,
                headers: responseStream.headers as Record<string, string>
            }
        });

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

                await logCtx.error('Failed to parse JSON response', { error: err });
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE);
            }
        });
    }

    private async handleErrorResponse({
        res,
        e,
        config,
        requestConfig,
        logCtx
    }: {
        res: Response;
        e: unknown;
        config: ApplicationConstructedProxyConfiguration;
        requestConfig: AxiosRequestConfig;
        logCtx: LogContext;
    }) {
        const error = e as AxiosError;

        if (!error.response?.data && error.toJSON) {
            const {
                message,
                stack,
                config: { method },
                code,
                status
            } = error.toJSON() as any;

            await this.reportError({ error, config, requestConfig, errorContent: message, logCtx });

            const errorObject = { message, stack, code, status, url: requestConfig.url, method };

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
                void this.reportError({ error, config, requestConfig, errorContent: errorData, logCtx });
            });
        } else {
            await logCtx.error('Unknown error');
            await logCtx.failed();
        }
    }

    private async request({
        res,
        method,
        url,
        config,
        decompress,
        data,
        logCtx,
        isDebug
    }: {
        res: Response;
        method: HTTP_METHOD;
        url: string;
        config: ApplicationConstructedProxyConfiguration;
        decompress: boolean;
        data?: unknown;
        logCtx: LogContext;
        isDebug: boolean;
    }) {
        const logs: MessageRowInsert[] = [];
        const headers = proxyService.constructHeaders(config, method, url);

        if (isDebug) {
            await logCtx.debug(`${method.toUpperCase()} ${url}`, { headers });
        }

        const requestConfig: AxiosRequestConfig = {
            method,
            url,
            responseType: 'stream',
            headers,
            decompress
        };
        try {
            if (data && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                requestConfig.data = data;
            }
            const responseStream: AxiosResponse = await backOff(
                () => {
                    return axios(requestConfig);
                },
                { numOfAttempts: Number(config.retries), retry: proxyService.retry.bind(this, config, logs) }
            );

            await flushLogsBuffer(logs, logCtx);

            await this.handleResponse({ res, responseStream, config, requestConfig, logCtx });
        } catch (err) {
            await this.handleErrorResponse({ res, e: err, requestConfig, config, logCtx });
            metrics.increment(metrics.Types.PROXY_FAILURE);
        }
    }

    private async reportError({
        error,
        config,
        requestConfig,
        errorContent,
        logCtx
    }: {
        error: AxiosError;
        config: ApplicationConstructedProxyConfiguration;
        requestConfig: AxiosRequestConfig;
        errorContent: string | Record<string, string>;
        logCtx: LogContext;
    }) {
        const valuesToFilter = Object.values(config.connection.credentials);
        const safeHeaders = redactHeaders({ headers: requestConfig.headers, valuesToFilter });
        const redactedURL = redactURL({ url: requestConfig.url!, valuesToFilter });

        await logCtx.http(`${requestConfig.method} ${redactedURL} failed with status '${error.response?.status}'`, {
            meta: {
                content: errorContent
            },
            request: {
                method: config.method,
                url: redactedURL,
                headers: safeHeaders
            },
            response: {
                code: error.response?.status || 500,
                headers: error.response?.headers as Record<string, string>
            }
        });
        await logCtx.failed();
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
