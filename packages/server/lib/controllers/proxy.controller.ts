import type { Request, Response, NextFunction } from 'express';
import type { OutgoingHttpHeaders } from 'http';
import type { TransformCallback } from 'stream';
import type stream from 'stream';
import { Readable, Transform, PassThrough } from 'stream';
import type { UrlWithParsedQuery } from 'url';
import url from 'url';
import querystring from 'querystring';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import axios from 'axios';
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
    getAccount,
    getEnvironmentId,
    ErrorSourceEnum,
    proxyService,
    connectionService,
    configService
} from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import { logContextGetter, oldLevelToNewLevel } from '@nangohq/logs';

type ForwardedHeaders = Record<string, string>;

class ProxyController {
    /**
     * Route Call
     * @desc Parse incoming request from the SDK or HTTP request and route the
     * call on the provided method after verifying the necessary parameters are set.
     * @param {Request} req Express request object
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     */
    public async routeCall(req: Request, res: Response, next: NextFunction) {
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
            const environment_id = getEnvironmentId(res);
            const accountId = getAccount(res);

            const logAction: LogAction = isSync ? LogActionEnum.SYNC : LogActionEnum.PROXY;

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
                environment_id
            };

            let activityLogId: number | null = null;

            if (!isDryRun) {
                activityLogId = existingActivityLogId ? Number(existingActivityLogId) : await createActivityLog(log);
            }
            // TODO: move that outside try/catch
            const logCtx = existingActivityLogId
                ? logContextGetter.get({ id: String(existingActivityLogId) })
                : await logContextGetter.create(
                      { operation: { type: 'action' }, message: 'Start action' },
                      { account: { id: accountId }, environment: { id: environment_id } },
                      { dryRun: isDryRun }
                  );

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

            const {
                success: connSuccess,
                error: connError,
                response: connection
            } = await connectionService.getConnectionCredentials(
                accountId,
                environment_id,
                connectionId,
                providerConfigKey,
                logContextGetter,
                activityLogId,
                logCtx,
                logAction,
                false
            );

            if (!connSuccess || !connection) {
                throw new Error(`Failed to get connection credentials: '${connError}'`);
            }
            const providerConfig = await configService.getProviderConfig(providerConfigKey, environment_id);

            if (!providerConfig && activityLogId) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: 'Provider configuration not found'
                });
                await logCtx.error('Provider configuration not found');
                await logCtx.failed();

                throw new NangoError('unknown_provider_config');
            }
            if (activityLogId && providerConfig) {
                await updateProviderActivityLog(activityLogId, providerConfig.provider);
                await logCtx.enrichOperation({ configId: providerConfig.id!, configName: providerConfig.unique_key });
            }

            const internalConfig: InternalProxyConfiguration = {
                existingActivityLogId: activityLogId,
                connection,
                provider: providerConfig!.provider
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
                environment_id,
                isSync,
                isDryRun,
                logCtx
            });
        } catch (error) {
            const environmentId = getEnvironmentId(res);
            const connectionId = req.get('Connection-Id') as string;
            const providerConfigKey = req.get('Provider-Config-Key') as string;

            errorManager.report(error, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.PROXY,
                environmentId,
                metadata: {
                    connectionId,
                    providerConfigKey
                }
            });
            next(error);
        }
    }

    /**
     * Send to http method
     * @desc route the call to a HTTP request based on HTTP method passed in
     * @param {Request} req Express request object
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     * @param {HTTP_VERB} method
     * @param {ApplicationConstructedProxyConfiguration} configBody
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

        if (configBody.decompress === true || configBody.template?.proxy?.decompress === true) {
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

        const passThroughStream = new PassThrough();
        responseStream.data.pipe(passThroughStream);
        passThroughStream.pipe(res);

        res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
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

        if (!error?.response?.data && error?.toJSON) {
            const {
                message,
                stack,
                config: { method },
                code,
                status
            } = error?.toJSON() as any;

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
                await logCtx?.error(`${method.toUpperCase()} request to ${url} failed`, errorObject);
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

        const errorData = error?.response?.data as stream.Readable;
        const stringify = new Transform({
            transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
                callback(null, chunk);
            }
        });
        if (error?.response?.status) {
            res.writeHead(error?.response?.status, error?.response?.headers as OutgoingHttpHeaders);
        }
        if (errorData) {
            errorData.pipe(stringify).pipe(res);
            stringify.on('data', (data) => {
                void this.reportError(error, url, config, activityLogId, environment_id, data, logCtx);
            });
        }
    }

    /**
     * Get
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     * @param {HTTP_VERB} method
     * @param {string} url
     * @param {ApplicationConstructedProxyConfiguration} config
     */

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
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
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
                    nangoComment: `The provider responded back with a ${error?.response?.status} to the url: ${url}`,
                    providerResponse: errorMessage.toString()
                }),
                params: {
                    requestHeaders: JSON.stringify(safeHeaders, null, 2),
                    responseHeaders: JSON.stringify(error?.response?.headers, null, 2)
                }
            });
            await logCtx?.error('he provider responded back with an error code', {
                code: error?.response?.status,
                url,
                error: errorMessage,
                requestHeaders: JSON.stringify(safeHeaders, null, 2),
                responseHeaders: JSON.stringify(error?.response?.headers, null, 2)
            });
        } else {
            const content = `The provider responded back with a ${error?.response?.status} and the message ${errorMessage} to the url: ${url}.${
                config.template.docs ? ` Refer to the documentation at ${config.template.docs} for help` : ''
            }`;
            console.error(content);
        }
    }
}

/**
 * Parse Headers
 * @param {Request} req Express request object
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
