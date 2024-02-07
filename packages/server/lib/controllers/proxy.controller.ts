import type { Request, Response, NextFunction } from 'express';
import type { OutgoingHttpHeaders } from 'http';
import stream, { Readable, Transform, TransformCallback, PassThrough } from 'stream';
import url, { UrlWithParsedQuery } from 'url';
import querystring from 'querystring';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { backOff } from 'exponential-backoff';
import { ActivityLogMessage, NangoError } from '@nangohq/shared';
import { updateProvider as updateProviderActivityLog, updateEndpoint as updateEndpointActivityLog } from '@nangohq/shared';

import {
    createActivityLog,
    createActivityLogMessageAndEnd,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    HTTP_VERB,
    LogLevel,
    LogAction,
    LogActionEnum,
    errorManager,
    UserProvidedProxyConfiguration,
    getAccount,
    getEnvironmentId,
    InternalProxyConfiguration,
    ApplicationConstructedProxyConfiguration,
    ErrorSourceEnum,
    proxyService,
    connectionService,
    configService
} from '@nangohq/shared';

interface ForwardedHeaders {
    [key: string]: string;
}

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

            let activityLogId = null;

            if (!isDryRun) {
                activityLogId = existingActivityLogId ? Number(existingActivityLogId) : await createActivityLog(log);
            }

            const { method } = req;

            const path = req.params[0] as string;
            const { query }: UrlWithParsedQuery = url.parse(req.url, true) as unknown as UrlWithParsedQuery;
            const queryString = querystring.stringify(query);
            const endpoint = `${path}${queryString ? `?${queryString}` : ''}`;

            const headers = this.parseHeaders(req);

            const externalConfig: UserProvidedProxyConfiguration = {
                endpoint,
                providerConfigKey,
                connectionId,
                retries: retries ? Number(retries) : 0,
                data: req.body,
                headers,
                baseUrlOverride,
                decompress: decompress === 'true' ? true : false,
                method: method.toUpperCase() as HTTP_VERB
            };

            const {
                success: connSuccess,
                error: connError,
                response: connection
            } = await connectionService.getConnectionCredentials(accountId, environment_id, connectionId, providerConfigKey, activityLogId, logAction, false);

            if (!connSuccess || !connection) {
                throw new Error(`Failed to get connection credentials: '${connError}'`);
            }
            const providerConfig = await configService.getProviderConfig(providerConfigKey, environment_id);

            if (!providerConfig) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: 'Provider configuration not found'
                });
                throw new NangoError('unknown_provider_config');
            }
            await updateProviderActivityLog(activityLogId as number, providerConfig.provider);

            const internalConfig: InternalProxyConfiguration = {
                existingActivityLogId: activityLogId as number,
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
                            break;
                        default:
                            await createActivityLogMessage(log);
                            break;
                    }
                }
            }
            if (!success || !proxyConfig || error) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            await this.sendToHttpMethod(res, next, method as HTTP_VERB, proxyConfig, activityLogId as number, environment_id, isSync, isDryRun);
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
    private sendToHttpMethod(
        res: Response,
        next: NextFunction,
        method: HTTP_VERB,
        configBody: ApplicationConstructedProxyConfiguration,
        activityLogId: number,
        environment_id: number,
        isSync?: boolean,
        isDryRun?: boolean
    ) {
        const url = proxyService.constructUrl(configBody);
        let decompress = false;

        if (configBody.decompress === true || configBody.template?.proxy?.decompress === true) {
            decompress = true;
        }

        return this.request(res, next, method, url, configBody, activityLogId, environment_id, decompress, isSync, isDryRun, configBody.data);
    }

    private async handleResponse(
        res: Response,
        responseStream: AxiosResponse,
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number,
        environment_id: number,
        url: string,
        isSync?: boolean,
        isDryRun?: boolean
    ) {
        if (!isSync) {
            await updateSuccessActivityLog(activityLogId, true);
        }

        if (!isDryRun) {
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
        activityLogId: number,
        environment_id: number
    ) {
        const error = e as AxiosError;

        if (!error?.response?.data) {
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
            res.writeHead(error?.response?.status as number, error?.response?.headers as OutgoingHttpHeaders);
        }
        if (errorData) {
            errorData.pipe(stringify).pipe(res);
            stringify.on('data', (data) => {
                this.reportError(error, url, config, activityLogId, environment_id, data);
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

    private async request(
        res: Response,
        _next: NextFunction,
        method: HTTP_VERB,
        url: string,
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number,
        environment_id: number,
        decompress: boolean,
        isSync?: boolean,
        isDryRun?: boolean,
        data?: unknown
    ) {
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
            activityLogs.forEach((activityLogMessage) => {
                createActivityLogMessage(activityLogMessage);
            });

            this.handleResponse(res, responseStream, config, activityLogId, environment_id, url, isSync, isDryRun);
        } catch (error) {
            this.handleErrorResponse(res, error, url, config, activityLogId, environment_id);
        }
    }

    private async reportError(
        error: AxiosError,
        url: string,
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number,
        environment_id: number,
        errorMessage: string
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
        } else {
            const content = `The provider responded back with a ${error?.response?.status} and the message ${errorMessage} to the url: ${url}.${
                config.template.docs ? ` Refer to the documentation at ${config.template.docs} for help` : ''
            }`;
            console.error(content);
        }
    }

    /**
     * Parse Headers
     * @param {Request} req Express request object
     */
    private parseHeaders(req: Request) {
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
}

export default new ProxyController();
