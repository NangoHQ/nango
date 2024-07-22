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
import type { HTTP_VERB, UserProvidedProxyConfiguration, InternalProxyConfiguration, ApplicationConstructedProxyConfiguration } from '@nangohq/shared';
import { NangoError, LogActionEnum, errorManager, ErrorSourceEnum, proxyService, connectionService, configService } from '@nangohq/shared';
import { metrics, getLogger, axiosInstance as axios } from '@nangohq/utils';
import { logContextGetter } from '@nangohq/logs';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../hooks/hooks.js';
import type { LogContext } from '@nangohq/logs';
import type { RequestLocals } from '../utils/express.js';
import type { LogsBuffer } from '@nangohq/types';

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
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;
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
                ? await logContextGetter.get({ id: String(existingActivityLogId) })
                : await logContextGetter.create({ operation: { type: 'proxy' }, message: 'Proxy call' }, { account, environment }, { dryRun: isDryRun });

            const { method } = req;

            const path = req.params[0] as string;
            const { query }: UrlWithParsedQuery = url.parse(req.url, true) as unknown as UrlWithParsedQuery;
            const queryString = querystring.stringify(query);
            const endpoint = `${path}${queryString ? `?${queryString}` : ''}`;

            const headers = parseHeaders(req);

            const externalConfig: UserProvidedProxyConfiguration = {
                endpoint,
                providerConfigKey,
                connectionId,
                retries: retries ? Number(retries) : 0,
                data: req.body,
                headers,
                baseUrlOverride,
                decompress: decompress === 'true' ? true : false,
                method: method.toUpperCase() as HTTP_VERB,
                retryOn
            };

            const credentialResponse = await connectionService.getConnectionCredentials({
                account,
                environment,
                connectionId,
                providerConfigKey,
                logContextGetter,
                instantRefresh: false,
                onRefreshSuccess: connectionRefreshSuccessHook,
                onRefreshFailed: connectionRefreshFailedHook
            });

            if (credentialResponse.isErr()) {
                await logCtx.error('Failed to get connection credentials', { error: credentialResponse.error });
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE);
                throw new Error(`Failed to get connection credentials: '${credentialResponse.error.message}'`);
            }

            const { value: connection } = credentialResponse;

            const providerConfig = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (!providerConfig) {
                await logCtx.error('Provider configuration not found');
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE);

                throw new NangoError('unknown_provider_config');
            }
            await logCtx.enrichOperation({
                integrationId: providerConfig.id!,
                integrationName: providerConfig.unique_key,
                providerName: providerConfig.provider,
                connectionId: connection.id!,
                connectionName: connection.connection_id
            });

            const internalConfig: InternalProxyConfiguration = {
                existingActivityLogId: logCtx.id,
                connection,
                provider: providerConfig.provider
            };

            const { success, error, response: proxyConfig, logs } = proxyService.configure(externalConfig, internalConfig);

            // We batch save, since we have buffered the createdAt it shouldn't impact order
            await Promise.all(
                logs.map(async (log) => {
                    await logCtx!.log({ type: 'log', ...log });
                })
            );

            if (!success || !proxyConfig || error) {
                errorManager.errResFromNangoErr(res, error);
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE);
                return;
            }

            await this.sendToHttpMethod({ res, method: method as HTTP_VERB, configBody: proxyConfig, logCtx });
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
        }
    }

    /**
     * Send to http method
     */
    private sendToHttpMethod({
        res,
        method,
        configBody,
        logCtx
    }: {
        res: Response;
        method: HTTP_VERB;
        configBody: ApplicationConstructedProxyConfiguration;
        logCtx: LogContext;
    }) {
        const url = proxyService.constructUrl(configBody);
        let decompress = false;

        if (configBody.decompress === true || configBody.template.proxy?.decompress === true) {
            decompress = true;
        }

        return this.request({
            res,
            method,
            url,
            config: configBody,
            decompress,
            data: configBody.data,
            logCtx
        });
    }

    private async handleResponse({
        res,
        responseStream,
        config,
        url,
        logCtx
    }: {
        res: Response;
        responseStream: AxiosResponse;
        config: ApplicationConstructedProxyConfiguration;
        url: string;
        logCtx: LogContext;
    }) {
        const safeHeaders = proxyService.stripSensitiveHeaders(config.headers, config);
        await logCtx.info(`${config.method.toUpperCase()} request to ${url} was successful`, { headers: safeHeaders });

        const contentType = responseStream.headers['content-type'];
        const isJsonResponse = contentType && contentType.includes('application/json');
        const isChunked = responseStream.headers['transfer-encoding'] === 'chunked';
        const isEncoded = Boolean(responseStream.headers['content-encoding']);

        if (isChunked || isEncoded) {
            const passThroughStream = new PassThrough();
            responseStream.data.pipe(passThroughStream);
            passThroughStream.pipe(res);
            res.writeHead(responseStream.status, responseStream.headers as OutgoingHttpHeaders);

            metrics.increment(metrics.Types.PROXY_SUCCESS);
            await logCtx.success();
            return;
        }

        let responseData = '';

        responseStream.data.on('data', (chunk: Buffer) => {
            responseData += chunk.toString();
        });

        responseStream.data.on('end', async () => {
            if (!isJsonResponse) {
                res.send(responseData);
                await logCtx.success();
                metrics.increment(metrics.Types.PROXY_SUCCESS);
                return;
            }

            try {
                const parsedResponse = JSON.parse(responseData);

                res.json(parsedResponse);
                metrics.increment(metrics.Types.PROXY_SUCCESS);
                await logCtx.success();
            } catch (error) {
                logger.error(error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to parse JSON response' }));

                await logCtx.error('Failed to parse JSON response', { error });
                await logCtx.failed();
                metrics.increment(metrics.Types.PROXY_FAILURE);
            }
        });
    }

    private async handleErrorResponse(res: Response, e: unknown, url: string, config: ApplicationConstructedProxyConfiguration, logCtx: LogContext) {
        const error = e as AxiosError;

        if (!error.response?.data && error.toJSON) {
            const {
                message,
                stack,
                config: { method },
                code,
                status
            } = error.toJSON() as any;

            const errorObject = { message, stack, code, status, url, method };

            await logCtx.error(`${method.toUpperCase()} request to ${url} failed`, { error });
            await logCtx.failed();

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
            errorData.pipe(stringify).pipe(res);
            stringify.on('data', (data) => {
                void this.reportError(error, url, config, data, logCtx);
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
        logCtx
    }: {
        res: Response;
        method: HTTP_VERB;
        url: string;
        config: ApplicationConstructedProxyConfiguration;
        decompress: boolean;
        data?: unknown;
        logCtx: LogContext;
    }) {
        try {
            const logs: LogsBuffer[] = [];
            const headers = proxyService.constructHeaders(config, method, url);

            await logCtx.debug(`Sending ${method.toUpperCase()} request to ${url}`, { headers });

            const requestConfig: AxiosRequestConfig = {
                method,
                url,
                responseType: 'stream',
                headers,
                decompress
            };
            if (data && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                requestConfig.data = data;
            }
            const responseStream: AxiosResponse = await backOff(
                () => {
                    return axios(requestConfig);
                },
                { numOfAttempts: Number(config.retries), retry: proxyService.retry.bind(this, config, logs) }
            );

            // We batch save, since we have buffered the createdAt it shouldn't impact order
            await Promise.all(
                logs.map(async (log) => {
                    await logCtx.log({ type: 'log', ...log });
                })
            );

            await this.handleResponse({ res, responseStream, config, url, logCtx });
        } catch (error) {
            await this.handleErrorResponse(res, error, url, config, logCtx);
            metrics.increment(metrics.Types.PROXY_FAILURE);
        }
    }

    private async reportError(error: AxiosError, url: string, config: ApplicationConstructedProxyConfiguration, errorMessage: string, logCtx: LogContext) {
        const safeHeaders = proxyService.stripSensitiveHeaders(config.headers, config);
        await logCtx.error('The provider responded back with an error code', {
            code: error.response?.status,
            url,
            error: errorMessage,
            requestHeaders: safeHeaders,
            responseHeaders: error.response?.headers
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
