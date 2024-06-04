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
import type {
    ActivityLogMessage,
    HTTP_VERB,
    LogLevel,
    LogAction,
    UserProvidedProxyConfiguration,
    InternalProxyConfiguration,
    ApplicationConstructedProxyConfiguration
} from '@nangohq/shared';
import {
    NangoError,
    updateProvider as updateProviderActivityLog,
    updateEndpoint as updateEndpointActivityLog,
    createActivityLog,
    createActivityLogMessageAndEnd,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    LogActionEnum,
    errorManager,
    ErrorSourceEnum,
    proxyService,
    connectionService,
    configService
} from '@nangohq/shared';
import { metrics, getLogger, axiosInstance as axios } from '@nangohq/utils';
import { logContextGetter, oldLevelToNewLevel } from '@nangohq/logs';
import { connectionRefreshFailed as connectionRefreshFailedHook } from '../hooks/hooks.js';
import type { LogContext } from '@nangohq/logs';
import type { RequestLocals } from '../utils/express.js';

type ForwardedHeaders = Record<string, string>;

const logger = getLogger('Proxy.Controller');

class ProxyController {
    /**
     * Route Call
     * @desc Parse incoming request from the SDK or HTTP request and route the
     * call on the provided method after verifying the necessary parameters are set.
     * @param {Request} req Express request object
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
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
            const existingActivityLogId = req.get('Nango-Activity-Log-Id') as number | string;

            const logAction: LogAction = isSync ? LogActionEnum.SYNC : LogActionEnum.PROXY;

            if (!isSync) {
                metrics.increment(metrics.Types.PROXY, 1, { accountId: account.id });
            }

            const log = {
                level: 'debug' as LogLevel,
                success: false,
                action: logAction,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                method: req.method as HTTP_VERB,
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                environment_id: environment.id
            };

            let activityLogId: number | null = null;

            if (!isDryRun) {
                activityLogId = existingActivityLogId ? Number(existingActivityLogId) : await createActivityLog(log);
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
                connectionRefreshFailedHook
            });

            if (credentialResponse.isErr()) {
                await logCtx.error('Failed to get connection credentials', { error: credentialResponse.error.message });
                await logCtx.failed();
                throw new Error(`Failed to get connection credentials: '${credentialResponse.error.message}'`);
            }

            const { value: connection } = credentialResponse;

            const providerConfig = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (!providerConfig) {
                if (activityLogId) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: environment.id,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content: 'Provider configuration not found'
                    });
                    await logCtx.error('Provider configuration not found');
                    await logCtx.failed();
                }

                throw new NangoError('unknown_provider_config');
            }

            if (activityLogId) {
                await updateProviderActivityLog(activityLogId, providerConfig.provider);
                await logCtx.enrichOperation({
                    integrationId: providerConfig.id!,
                    integrationName: providerConfig.unique_key,
                    providerName: providerConfig.provider,
                    connectionId: connection.id!,
                    connectionName: connection.connection_id
                });
            }

            const internalConfig: InternalProxyConfiguration = {
                existingActivityLogId: activityLogId,
                connection,
                provider: providerConfig.provider
            };

            const { success, error, response: proxyConfig, activityLogs } = proxyService.configure(externalConfig, internalConfig);
            if (activityLogId) {
                await updateEndpointActivityLog(activityLogId, externalConfig.endpoint);
                for (const log of activityLogs) {
                    switch (log.level) {
                        case 'error':
                            await createActivityLogMessageAndEnd(log);
                            await logCtx.error(log.content);
                            break;
                        default:
                            await createActivityLogMessage(log);
                            await logCtx.info(log.content);
                            break;
                    }
                }
            }
            if (!success || !proxyConfig || error) {
                errorManager.errResFromNangoErr(res, error);
                await logCtx.failed();
                return;
            }

            await this.sendToHttpMethod({
                res,
                method: method as HTTP_VERB,
                configBody: proxyConfig,
                activityLogId,
                environment_id: environment.id,
                isSync,
                isDryRun,
                logCtx
            });
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
        activityLogId,
        environment_id,
        isSync,
        isDryRun,
        logCtx
    }: {
        res: Response;
        method: HTTP_VERB;
        configBody: ApplicationConstructedProxyConfiguration;
        activityLogId: number | null;
        environment_id: number;
        isSync?: boolean | undefined;
        isDryRun?: boolean | undefined;
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
            activityLogId,
            environment_id,
            decompress,
            isSync,
            isDryRun,
            data: configBody.data,
            logCtx
        });
    }

    private async handleResponse({
        res,
        responseStream,
        config,
        activityLogId,
        environment_id,
        url,
        isSync = false,
        isDryRun = false,
        logCtx
    }: {
        res: Response;
        responseStream: AxiosResponse;
        config: ApplicationConstructedProxyConfiguration;
        activityLogId: number | null;
        environment_id: number;
        url: string;
        isSync?: boolean | undefined;
        isDryRun?: boolean | undefined;
        logCtx: LogContext;
    }) {
        if (!isDryRun && activityLogId) {
            if (!isSync) {
                await updateSuccessActivityLog(activityLogId, true);
            }
            const safeHeaders = proxyService.stripSensitiveHeaders(config.headers, config);
            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `${config.method.toUpperCase()} request to ${url} was successful`,
                params: {
                    headers: JSON.stringify(safeHeaders)
                }
            });
            await logCtx.info(`${config.method.toUpperCase()} request to ${url} was successful`, { headers: JSON.stringify(safeHeaders) });
        }

        const contentType = responseStream.headers['content-type'];
        const isJsonResponse = contentType && contentType.includes('application/json');
        const isChunked = responseStream.headers['transfer-encoding'] === 'chunked';
        const isZip = responseStream.headers['content-encoding'] === 'gzip';

        if (isChunked || isZip) {
            const passThroughStream = new PassThrough();
            responseStream.data.pipe(passThroughStream);
            passThroughStream.pipe(res);
            res.writeHead(responseStream.status, responseStream.headers as OutgoingHttpHeaders);

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
                return;
            }

            try {
                const parsedResponse = JSON.parse(responseData);

                res.json(parsedResponse);
                await logCtx.success();
            } catch (error) {
                logger.error(error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to parse JSON response' }));

                await logCtx.error('Failed to parse JSON response', { error });
                await logCtx.failed();
            }
        });
    }

    private async handleErrorResponse(
        res: Response,
        e: unknown,
        url: string,
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number | null,
        environment_id: number,
        logCtx: LogContext
    ) {
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

            if (activityLogId) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: `${method.toUpperCase()} request to ${url} failed`,
                    params: errorObject
                });
                await logCtx.error(`${method.toUpperCase()} request to ${url} failed`, errorObject);
            } else {
                console.error(`Error: ${method.toUpperCase()} request to ${url} failed with the following params: ${JSON.stringify(errorObject)}`);
            }

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
                void this.reportError(error, url, config, activityLogId, environment_id, data, logCtx);
            });
        }
    }

    private async request({
        res,
        method,
        url,
        config,
        activityLogId,
        environment_id,
        decompress,
        isSync,
        isDryRun,
        data,
        logCtx
    }: {
        res: Response;
        method: HTTP_VERB;
        url: string;
        config: ApplicationConstructedProxyConfiguration;
        activityLogId: number | null;
        environment_id: number;
        decompress: boolean;
        isSync?: boolean | undefined;
        isDryRun?: boolean | undefined;
        data?: unknown;
        logCtx: LogContext;
    }) {
        try {
            const activityLogs: ActivityLogMessage[] = [];
            const headers = proxyService.constructHeaders(config);
            const requestConfig: AxiosRequestConfig = {
                method,
                url,
                responseType: 'stream',
                headers,
                decompress
            };
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                requestConfig.data = data || {};
            }
            const responseStream: AxiosResponse = await backOff(
                () => {
                    return axios(requestConfig);
                },
                { numOfAttempts: Number(config.retries), retry: proxyService.retry.bind(this, activityLogId, environment_id, config, activityLogs) }
            );
            await Promise.all(
                activityLogs.map(async (msg) => {
                    await createActivityLogMessage(msg);
                    await logCtx.log({
                        type: 'log',
                        level: oldLevelToNewLevel[msg.level],
                        message: msg.content,
                        createdAt: new Date(msg.timestamp).toISOString()
                    });
                })
            );

            await this.handleResponse({ res, responseStream, config, activityLogId, environment_id, url, isSync, isDryRun, logCtx });
        } catch (error) {
            await this.handleErrorResponse(res, error, url, config, activityLogId, environment_id, logCtx);
        }
    }

    private async reportError(
        error: AxiosError,
        url: string,
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number | null,
        environment_id: number,
        errorMessage: string,
        logCtx: LogContext | undefined
    ) {
        if (activityLogId) {
            const safeHeaders = proxyService.stripSensitiveHeaders(config.headers, config);
            await createActivityLogMessageAndEnd({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: JSON.stringify({
                    nangoComment: `The provider responded back with a ${error.response?.status} to the url: ${url}`,
                    providerResponse: errorMessage.toString()
                }),
                params: {
                    requestHeaders: JSON.stringify(safeHeaders, null, 2),
                    responseHeaders: JSON.stringify(error.response?.headers, null, 2)
                }
            });
            await logCtx?.error('he provider responded back with an error code', {
                code: error.response?.status,
                url,
                error: errorMessage,
                requestHeaders: JSON.stringify(safeHeaders, null, 2),
                responseHeaders: JSON.stringify(error.response?.headers, null, 2)
            });
        } else {
            const content = `The provider responded back with a ${error.response?.status} and the message ${errorMessage} to the url: ${url}.${
                config.template.docs ? ` Refer to the documentation at ${config.template.docs} for help` : ''
            }`;
            console.error(content);
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
