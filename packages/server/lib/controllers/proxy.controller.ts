import type { Request, Response, NextFunction } from 'express';
import type { OutgoingHttpHeaders } from 'http';
import stream, { Transform, TransformCallback, PassThrough } from 'stream';
import url, { UrlWithParsedQuery } from 'url';
import querystring from 'querystring';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { backOff } from 'exponential-backoff';

import logger from '../utils/logger.js';
import {
    Connection,
    createActivityLog,
    createActivityLogMessageAndEnd,
    createActivityLogMessage,
    updateProvider as updateProviderActivityLog,
    updateSuccess as updateSuccessActivityLog,
    updateEndpoint as updateEndpointActivityLog,
    HTTP_VERB,
    LogLevel,
    LogAction,
    configService,
    errorManager,
    connectionService,
    getAccount,
    interpolateIfNeeded
} from '@nangohq/shared';
import type { ProxyBodyConfiguration } from '../models.js';

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
            const isSync = req.get('Nango-Is-Sync') as string;
            const isDryRun = req.get('Nango-Is-Dry-Run') as string;
            const existingActivityLogId = req.get('Nango-Activity-Log-Id') as number | string;
            const baseUrlOverride = req.get('Nango-Base-Url-Override') as string;
            const accountId = getAccount(res);

            const logAction: LogAction = isSync ? 'sync' : ('proxy' as LogAction);

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
                account_id: accountId
            };

            let activityLogId = null;

            if (!isDryRun) {
                activityLogId = existingActivityLogId ? Number(existingActivityLogId) : await createActivityLog(log);
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The connection id value is missing. If you're making a HTTP request then it should be included in the header 'Connection-Id'. If you're using the SDK the connectionId property should be specified.`
                });
                return;
            }

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_provider_config_key');

                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The provider config key value is missing. If you're making a HTTP request then it should be included in the header 'Provider-Config-Key'. If you're using the SDK the providerConfigKey property should be specified.`
                });
                return;
            }

            if (!isSync) {
                await createActivityLogMessage({
                    level: 'debug',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Connection id: '${connectionId}' and provider config key: '${providerConfigKey}' parsed and received successfully`
                });
            }

            const connection = await connectionService.getConnectionCredentials(
                res,
                connectionId,
                providerConfigKey,
                activityLogId as number,
                logAction,
                false
            );

            if (!isSync) {
                await createActivityLogMessage({
                    level: 'debug',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: 'Connection credentials found successfully'
                });
            }

            const { method } = req;

            const path = req.params[0] as string;
            const { query }: UrlWithParsedQuery = url.parse(req.url, true) as unknown as UrlWithParsedQuery;
            const queryString = querystring.stringify(query);
            const endpoint = `${path}${queryString ? `?${queryString}` : ''}`;

            if (!endpoint) {
                errorManager.errRes(res, 'missing_endpoint');

                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: 'Proxy: a API URL endpoint is missing.'
                });
                return;
            }

            await updateEndpointActivityLog(activityLogId as number, endpoint);

            let token;

            switch (connection?.credentials?.type) {
                case 'OAUTH2':
                    token = connection?.credentials?.access_token;
                    break;
                // TODO
                case 'OAUTH1':
                    token = { oAuthToken: connection?.credentials?.oauth_token, oAuthTokenSecret: connection?.credentials?.oauth_token_secret };
                    break;
                default:
                    throw new Error(`Unrecognized OAuth type '${connection?.credentials?.type}' in stored credentials.`);
            }

            if (!isSync) {
                await createActivityLogMessage({
                    level: 'debug',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: 'Proxy: token retrieved successfully'
                });
            }

            const providerConfig = await configService.getProviderConfig(providerConfigKey, accountId);
            const headers = this.parseHeaders(req);

            if (!providerConfig) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: 'Provider configuration not found'
                });

                res.status(404).send();
            }

            await updateProviderActivityLog(activityLogId as number, String(providerConfig?.provider));

            const template = configService.getTemplate(String(providerConfig?.provider));

            if (!template.base_api_url && !baseUrlOverride) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `${Date.now()} The proxy is not supported for this provider ${String(
                        providerConfig?.provider
                    )}. You can easily add support by following the instructions at https://docs.nango.dev/contribute/nango-auth`
                });

                errorManager.errRes(res, 'missing_base_api_url');
                return;
            }

            if (!isSync) {
                await createActivityLogMessage({
                    level: 'debug',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Proxy: API call configuration constructed successfully with the base api url set to ${template.base_api_url}`
                });
            }

            const configBody: ProxyBodyConfiguration = {
                endpoint,
                method: method as HTTP_VERB,
                template,
                // handle oauth1
                token: String(token),
                provider: String(providerConfig?.provider),
                providerConfigKey,
                connectionId,
                headers,
                data: req.body,
                retries: retries ? Number(retries) : 0,
                baseUrlOverride
            };

            if (!isSync) {
                await createActivityLogMessage({
                    level: 'debug',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Endpoint set to ${configBody.endpoint} with retries set to ${configBody.retries}`
                });
            }

            await this.sendToHttpMethod(res, next, method as HTTP_VERB, configBody, activityLogId as number, connection, isSync, isDryRun);
        } catch (error) {
            console.log(error);
            next(error);
        }
    }

    /**
     * Retry
     * @desc if retries are set the retry function to determine if retries are
     * actually kicked off or not
     * @param {AxiosError} error
     * @param {attemptNumber} number
     */
    private retry = (error: AxiosError, attemptNumber: number): boolean => {
        if (error?.response?.status.toString().startsWith('5') || error?.response?.status === 429) {
            logger.info(`API received an ${error?.response?.status} error, retrying with exponential backoffs for a total of ${attemptNumber} times`);
            return true;
        }

        return false;
    };

    /**
     * Send to http method
     * @desc route the call to a HTTP request based on HTTP method passed in
     * @param {Request} req Express request object
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     * @param {HTTP_VERB} method
     * @param {ProxyBodyConfiguration} configBody
     */
    private sendToHttpMethod(
        res: Response,
        next: NextFunction,
        method: HTTP_VERB,
        configBody: ProxyBodyConfiguration,
        activityLogId: number,
        connection: Connection,
        isSync?: string,
        isDryRun?: string
    ) {
        const url = this.constructUrl(configBody, connection);

        if (method === 'POST') {
            return this.post(res, next, url, configBody, activityLogId, isSync, isDryRun);
        } else if (method === 'PATCH') {
            return this.patch(res, next, url, configBody, activityLogId, isSync, isDryRun);
        } else if (method === 'PUT') {
            return this.put(res, next, url, configBody, activityLogId, isSync, isDryRun);
        } else if (method === 'DELETE') {
            return this.delete(res, next, url, configBody, activityLogId, isSync, isDryRun);
        } else {
            return this.get(res, next, url, configBody, activityLogId, isSync, isDryRun);
        }
    }

    private async handleResponse(
        res: Response,
        responseStream: AxiosResponse,
        config: ProxyBodyConfiguration,
        activityLogId: number,
        url: string,
        isSync?: string,
        isDryRun?: string
    ) {
        if (!isSync) {
            await updateSuccessActivityLog(activityLogId, true);
        }

        if (!isDryRun) {
            await createActivityLogMessageAndEnd({
                level: 'info',
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `${config.method.toUpperCase()} request to ${url} was successful`,
                params: {
                    headers: JSON.stringify(config.headers)
                }
            });
        }

        const passThroughStream = new PassThrough();
        responseStream.data.pipe(passThroughStream);
        passThroughStream.pipe(res);

        res.writeHead(responseStream?.status, responseStream.headers as OutgoingHttpHeaders);
    }

    private async handleErrorResponse(res: Response, e: unknown, url: string, config: ProxyBodyConfiguration, activityLogId: number) {
        const error = e as AxiosError;
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
                this.reportError(error, url, config, activityLogId, data);
            });
        }
    }

    /**
     * Get
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     * @param {string} url
     * @param {ProxyBodyConfiguration} config
     */
    private async get(
        res: Response,
        next: NextFunction,
        url: string,
        config: ProxyBodyConfiguration,
        activityLogId: number,
        isSync?: string,
        isDryRun?: string
    ) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream: AxiosResponse = await backOff(
                () => {
                    return axios({
                        method: 'get',
                        url,
                        responseType: 'stream',
                        headers,
                        decompress: false
                    });
                },
                { numOfAttempts: Number(config.retries), retry: this.retry }
            );

            this.handleResponse(res, responseStream, config, activityLogId, url, isSync, isDryRun);
        } catch (e: unknown) {
            this.handleErrorResponse(res, e, url, config, activityLogId);
            next(e);
        }
    }

    /**
     * Post
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     * @param {string} url
     * @param {ProxyBodyConfiguration} config
     */
    private async post(
        res: Response,
        next: NextFunction,
        url: string,
        config: ProxyBodyConfiguration,
        activityLogId: number,
        isSync?: string,
        isDryRun?: string
    ) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream: AxiosResponse = await backOff(
                () => {
                    return axios({
                        method: 'post',
                        url,
                        data: config.data ?? {},
                        responseType: 'stream',
                        headers,
                        decompress: false
                    });
                },
                { numOfAttempts: Number(config.retries), retry: this.retry }
            );

            this.handleResponse(res, responseStream, config, activityLogId, url, isSync, isDryRun);
        } catch (error) {
            this.handleErrorResponse(res, error, url, config, activityLogId);
            next(error);
        }
    }

    /**
     * Patch
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     * @param {string} url
     * @param {ProxyBodyConfiguration} config
     */
    private async patch(
        res: Response,
        next: NextFunction,
        url: string,
        config: ProxyBodyConfiguration,
        activityLogId: number,
        isSync?: string,
        isDryRun?: string
    ) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream: AxiosResponse = await backOff(
                () => {
                    return axios({
                        method: 'patch',
                        url,
                        data: config.data ?? {},
                        responseType: 'stream',
                        headers,
                        decompress: false
                    });
                },
                { numOfAttempts: Number(config.retries), retry: this.retry }
            );

            this.handleResponse(res, responseStream, config, activityLogId, url, isSync, isDryRun);
        } catch (error) {
            this.handleErrorResponse(res, error, url, config, activityLogId);
            next(error);
        }
    }

    /**
     * Put
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     * @param {string} url
     * @param {ProxyBodyConfiguration} config
     */
    private async put(
        res: Response,
        next: NextFunction,
        url: string,
        config: ProxyBodyConfiguration,
        activityLogId: number,
        isSync?: string,
        isDryRun?: string
    ) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream: AxiosResponse = await backOff(
                () => {
                    return axios({
                        method: 'put',
                        url,
                        data: config.data ?? {},
                        responseType: 'stream',
                        headers,
                        decompress: false
                    });
                },
                { numOfAttempts: Number(config.retries), retry: this.retry }
            );

            this.handleResponse(res, responseStream, config, activityLogId, url, isSync, isDryRun);
        } catch (error) {
            this.handleErrorResponse(res, error, url, config, activityLogId);
            next(error);
        }
    }

    /**
     * Delete
     * @param {Response} res Express response object
     * @param {NextFuncion} next callback function to pass control to the next middleware function in the pipeline.
     * @param {string} url
     * @param {ProxyBodyConfiguration} config
     */
    private async delete(
        res: Response,
        next: NextFunction,
        url: string,
        config: ProxyBodyConfiguration,
        activityLogId: number,
        isSync?: string,
        isDryRun?: string
    ) {
        try {
            const headers = this.constructHeaders(config);
            const responseStream: AxiosResponse = await backOff(
                () => {
                    return axios({
                        method: 'delete',
                        url,
                        responseType: 'stream',
                        headers,
                        decompress: false
                    });
                },
                { numOfAttempts: Number(config.retries), retry: this.retry }
            );
            this.handleResponse(res, responseStream, config, activityLogId, url, isSync, isDryRun);
        } catch (error) {
            this.handleErrorResponse(res, error, url, config, activityLogId);
            next(error);
        }
    }

    private async reportError(error: AxiosError, url: string, config: ProxyBodyConfiguration, activityLogId: number, errorMessage: string) {
        if (activityLogId) {
            await createActivityLogMessageAndEnd({
                level: 'error',
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `The provider responded back with a ${error?.response?.status} and the message ${errorMessage} to the url: ${url}.${
                    config.template.docs ? ` Refer to the documentation at ${config.template.docs} for help` : ''
                }`,
                params: {
                    headers: JSON.stringify(config.headers)
                }
            });
        }
    }

    /**
     * Construct URL
     * @param {ProxyBodyConfiguration} config
     *
     */
    private constructUrl(config: ProxyBodyConfiguration, connection: Connection) {
        const {
            template: { base_api_url: templateApiBase },
            endpoint: apiEndpoint
        } = config;

        const apiBase = config.baseUrlOverride || templateApiBase;

        const base = apiBase?.substr(-1) === '/' ? apiBase.slice(0, -1) : apiBase;
        const endpoint = apiEndpoint?.charAt(0) === '/' ? apiEndpoint.slice(1) : apiEndpoint;

        const fullEndpoint = interpolateIfNeeded(`${base}/${endpoint}`, connection as unknown as Record<string, string>);

        return fullEndpoint;
    }

    /**
     * Construct Headers
     * @param {ProxyBodyConfiguration} config
     */
    private constructHeaders(config: ProxyBodyConfiguration) {
        let headers = {
            Authorization: `Bearer ${config.token}`
        };
        if (config.headers) {
            const { headers: configHeaders } = config;
            headers = { ...headers, ...configHeaders };
        }

        return headers;
    }

    /**
     * Parse Headers
     * @param {ProxyBodyConfiguration} config
     * @param {Request} req Express request object
     */
    private parseHeaders(req: Request) {
        const headers = req.rawHeaders;
        const HEADER_PROXY = 'nango-proxy-';
        const forwardedHeaders: ForwardedHeaders = {};

        for (let i = 0, n = headers.length; i < n; i += 2) {
            const headerKey = headers[i]?.toLowerCase();

            if (headerKey?.startsWith(HEADER_PROXY)) {
                forwardedHeaders[headerKey.slice(HEADER_PROXY.length)] = headers[i + 1] || '';
            }
        }

        return forwardedHeaders;
    }
}

export default new ProxyController();
