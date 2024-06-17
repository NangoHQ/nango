import type { AxiosError, AxiosResponse, AxiosRequestConfig, ParamsSerializerOptions } from 'axios';
import { axiosInstance as axios, getLogger } from '@nangohq/utils';
import { backOff } from 'exponential-backoff';
import FormData from 'form-data';
import type { ApiKeyCredentials, BasicApiCredentials } from '../models/Auth.js';
import type { HTTP_VERB, ServiceResponse } from '../models/Generic.js';
import type { ResponseType, ApplicationConstructedProxyConfiguration, UserProvidedProxyConfiguration, InternalProxyConfiguration } from '../models/Proxy.js';

import configService from './config.service.js';
import { interpolateIfNeeded, connectionCopyWithParsedConnectionConfig, mapProxyBaseUrlInterpolationFormat } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';
import type { LogsBuffer, Template as ProviderTemplate } from '@nangohq/types';

const logger = getLogger('Proxy');

interface Logs {
    logs: LogsBuffer[];
}

interface RouteResponse {
    response: AxiosResponse | AxiosError | Error;
}
interface RetryHandlerResponse {
    shouldRetry: boolean;
}

class ProxyService {
    public async route(
        externalConfig: ApplicationConstructedProxyConfiguration | UserProvidedProxyConfiguration,
        internalConfig: InternalProxyConfiguration
    ): Promise<RouteResponse & Logs> {
        const { success, error, response: proxyConfig, logs } = this.configure(externalConfig, internalConfig);
        if (!success || error || !proxyConfig) {
            return { response: error instanceof NangoError ? error : new Error(`Proxy configuration is missing`), logs };
        }
        return await this.sendToHttpMethod(proxyConfig).then((resp) => {
            return { response: resp.response, logs: [...logs, ...resp.logs] };
        });
    }

    public configure(
        externalConfig: ApplicationConstructedProxyConfiguration | UserProvidedProxyConfiguration,
        internalConfig: InternalProxyConfiguration
    ): ServiceResponse<ApplicationConstructedProxyConfiguration> & Logs {
        const logs: LogsBuffer[] = [];
        let data = externalConfig.data;
        const { endpoint: passedEndpoint, providerConfigKey, connectionId, method, retries, headers, baseUrlOverride, retryOn } = externalConfig;
        const { connection, provider } = internalConfig;

        if (!passedEndpoint && !baseUrlOverride) {
            logs.push({ level: 'error', createdAt: new Date().toISOString(), message: 'Proxy: a API URL endpoint is missing.' });
            return { success: false, error: new NangoError('missing_endpoint'), response: null, logs };
        }
        if (!connectionId) {
            logs.push({
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `The connection id value is missing. If you're making a HTTP request then it should be included in the header 'Connection-Id'. If you're using the SDK the connectionId property should be specified.`
            });
            return { success: false, error: new NangoError('missing_connection_id'), response: null, logs };
        }
        if (!providerConfigKey) {
            logs.push({
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `The provider config key value is missing. If you're making a HTTP request then it should be included in the header 'Provider-Config-Key'. If you're using the SDK the providerConfigKey property should be specified.`
            });
            return { success: false, error: new NangoError('missing_provider_config_key'), response: null, logs };
        }

        logs.push({
            level: 'debug',
            createdAt: new Date().toISOString(),
            message: `Connection id: '${connectionId}' and provider config key: '${providerConfigKey}' parsed and received successfully`
        });

        let endpoint = passedEndpoint;

        let token;
        switch (connection.credentials.type) {
            case 'OAUTH2':
                {
                    const credentials = connection.credentials;
                    token = credentials.access_token;
                }
                break;
            case 'OAUTH1': {
                const error = new Error('OAuth1 is not supported yet in the proxy.');
                const nangoError = new NangoError('pass_through_error', error);
                return { success: false, error: nangoError, response: null, logs };
            }
            case 'BASIC':
                token = connection.credentials;
                break;
            case 'API_KEY':
                token = connection.credentials;
                break;
            case 'APP':
                {
                    const credentials = connection.credentials;
                    token = credentials.access_token;
                }
                break;
            case 'OAUTH2_CC':
                {
                    const credentials = connection.credentials;
                    token = credentials.token;
                }
                break;
        }

        logs.push({
            level: 'debug',
            createdAt: new Date().toISOString(),
            message: 'Proxy: token retrieved successfully'
        });

        let template: ProviderTemplate | undefined;
        try {
            template = configService.getTemplate(provider);
        } catch {
            logger.error('failed to getTemplate');
        }

        if (!template || ((!template.proxy || !template.proxy.base_url) && !baseUrlOverride)) {
            logs.push({
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `The proxy is either not supported for the provider ${provider} or it does not have a default base URL configured (use the baseUrlOverride config param to specify a base URL).`
            });

            return { success: false, error: new NangoError('missing_base_api_url'), response: null, logs };
        }

        logs.push({
            level: 'debug',
            createdAt: new Date().toISOString(),
            message: `Proxy: API call configuration constructed successfully with the base api url set to ${baseUrlOverride || template.proxy?.base_url}`
        });

        if (!baseUrlOverride && template.proxy?.base_url && endpoint.includes(template.proxy.base_url)) {
            endpoint = endpoint.replace(template.proxy.base_url, '');
        }

        logs.push({
            level: 'debug',
            createdAt: new Date().toISOString(),
            message: `Endpoint set to ${endpoint} with retries set to ${retries} ${retryOn ? `and retryOn set to ${retryOn}` : ''}`
        });

        if (headers && headers['Content-Type'] === 'multipart/form-data') {
            const formData = new FormData();

            Object.keys(data as any).forEach((key) => {
                formData.append(key, (data as any)[key]);
            });

            data = formData;
        }

        const configBody: ApplicationConstructedProxyConfiguration = {
            endpoint,
            method: method?.toUpperCase() as HTTP_VERB,
            template,
            token: token || '',
            provider: provider,
            providerConfigKey,
            connectionId,
            headers: headers as Record<string, string>,
            data,
            retries: retries || 0,
            baseUrlOverride: baseUrlOverride as string,
            // decompress is used only when the call is truly a proxy call
            // Coming from a flow it is not a proxy call since the worker
            // makes the request so we don't allow an override in that case
            decompress: (externalConfig as UserProvidedProxyConfiguration).decompress === 'true' || externalConfig.decompress === true,
            connection,
            params: externalConfig.params as Record<string, string>,
            paramsSerializer: externalConfig.paramsSerializer as ParamsSerializerOptions,
            responseType: externalConfig.responseType as ResponseType,
            retryOn: retryOn && Array.isArray(retryOn) ? retryOn.map(Number) : null
        };

        return { success: true, error: null, response: configBody, logs };
    }

    public retryHandler = async (error: AxiosError, type: 'at' | 'after', retryHeader: string): Promise<RetryHandlerResponse & Logs> => {
        const logs: LogsBuffer[] = [];

        if (type === 'at') {
            const resetTimeEpoch = error.response?.headers[retryHeader] || error.response?.headers[retryHeader.toLowerCase()];

            if (resetTimeEpoch) {
                const currentEpochTime = Math.floor(Date.now() / 1000);
                const retryAtEpoch = Number(resetTimeEpoch);

                if (retryAtEpoch > currentEpochTime) {
                    const waitDuration = retryAtEpoch - currentEpochTime;

                    const content = `Rate limit reset time was parsed successfully, retrying after ${waitDuration} seconds`;

                    logs.push({
                        level: 'error',
                        createdAt: new Date().toISOString(),
                        message: content
                    });

                    await new Promise((resolve) => setTimeout(resolve, waitDuration * 1000));

                    return { shouldRetry: true, logs };
                }
            }
        }

        if (type === 'after') {
            const retryHeaderVal = error.response?.headers[retryHeader] || error.response?.headers[retryHeader.toLowerCase()];

            if (retryHeaderVal) {
                const retryAfter = Number(retryHeaderVal);
                const content = `Retry header was parsed successfully, retrying after ${retryAfter} seconds`;

                logs.push({
                    level: 'error',
                    createdAt: new Date().toISOString(),
                    message: content
                });

                await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

                return { shouldRetry: true, logs };
            }
        }

        return { shouldRetry: true, logs };
    };

    /**
     * Retry
     * @desc if retries are set the retry function to determine if retries are
     * actually kicked off or not
     * @param {AxiosError} error
     * @param {attemptNumber} number
     */
    public retry = async (config: ApplicationConstructedProxyConfiguration, logs: LogsBuffer[], error: AxiosError, attemptNumber: number): Promise<boolean> => {
        if (
            error.response?.status.toString().startsWith('5') ||
            // Note that Github issues a 403 for both rate limits and improper scopes
            (error.response?.status === 403 && error.response.headers['x-ratelimit-remaining'] && error.response.headers['x-ratelimit-remaining'] === '0') ||
            error.response?.status === 429 ||
            ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(error.code as string) ||
            config.retryOn?.includes(Number(error.response?.status))
        ) {
            if (config.retryHeader) {
                const type = config.retryHeader.at ? 'at' : 'after';
                const retryHeader = config.retryHeader.at ? config.retryHeader.at : config.retryHeader.after;

                const { shouldRetry, logs: retryActivityLogs } = await this.retryHandler(error, type, retryHeader as string);
                retryActivityLogs.forEach((a: LogsBuffer) => logs.push(a));
                return shouldRetry;
            }

            if (config.template.proxy && config.template.proxy.retry && (config.template.proxy.retry.at || config.template.proxy.retry.after)) {
                const type = config.template.proxy.retry.at ? 'at' : 'after';
                const retryHeader = config.template.proxy.retry.at ? config.template.proxy.retry.at : config.template.proxy.retry.after;

                const { shouldRetry, logs: retryActivityLogs } = await this.retryHandler(error, type, retryHeader as string);
                retryActivityLogs.forEach((a: LogsBuffer) => logs.push(a));
                return shouldRetry;
            }

            const content = `API received an ${error.response?.status || error.code} error, ${
                config.retries && config.retries > 0
                    ? `retrying with exponential backoffs for a total of ${attemptNumber} out of ${config.retries} times`
                    : 'but no retries will occur because retries defaults to 0 or were set to 0'
            }`;

            logs.push({
                level: 'error',
                createdAt: new Date().toISOString(),
                message: content
            });

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
     * @param {ApplicationConstructedProxyConfiguration} configBody
     */
    private sendToHttpMethod(configBody: ApplicationConstructedProxyConfiguration): Promise<RouteResponse & Logs> {
        const options: AxiosRequestConfig = {
            headers: configBody.headers as Record<string, string | number | boolean>
        };

        if (configBody.params) {
            options.params = configBody.params as Record<string, string>;
        }

        if (configBody.paramsSerializer) {
            options.paramsSerializer = configBody.paramsSerializer;
        }

        if (configBody.responseType) {
            options.responseType = configBody.responseType;
        }

        if (configBody.data) {
            options.data = configBody.data;
        }

        const { method } = configBody;

        options.url = this.constructUrl(configBody);
        options.method = method;

        const headers = this.constructHeaders(configBody);
        options.headers = { ...options.headers, ...headers };

        return this.request(configBody, options);
    }

    public stripSensitiveHeaders(headers: ApplicationConstructedProxyConfiguration['headers'], config: ApplicationConstructedProxyConfiguration) {
        const safeHeaders = { ...headers };

        if (!config.token) {
            if (safeHeaders['Authorization']?.includes('Bearer')) {
                safeHeaders['Authorization'] = safeHeaders['Authorization'].replace(/Bearer.*/, 'Bearer xxxx');
            }

            return safeHeaders;
        }

        Object.keys(safeHeaders).forEach((header) => {
            if (safeHeaders[header] === config.token) {
                safeHeaders[header] = 'xxxx';
            }
            const headerValue = safeHeaders[header];
            if (headerValue?.includes(config.token as string)) {
                safeHeaders[header] = headerValue.replace(config.token as string, 'xxxx');
            }
        });

        return safeHeaders;
    }

    private async request(config: ApplicationConstructedProxyConfiguration, options: AxiosRequestConfig): Promise<RouteResponse & Logs> {
        const logs: LogsBuffer[] = [];
        try {
            const response: AxiosResponse = await backOff(
                () => {
                    return axios.request(options);
                },
                { numOfAttempts: Number(config.retries), retry: this.retry.bind(this, config, logs) }
            );

            const handling = this.handleResponse(config, options.url!);
            return { response, logs: [...logs, ...handling.logs] };
        } catch (e: unknown) {
            const handling = this.handleErrorResponse(e as AxiosError, options.url!, config);
            return { response: handling.response, logs: [...logs, ...handling.logs] };
        }
    }

    /**
     * Construct URL
     * @param {ApplicationConstructedProxyConfiguration} config
     *
     */
    public constructUrl(config: ApplicationConstructedProxyConfiguration) {
        const { connection } = config;
        const { template: { proxy: { base_url: templateApiBase } = {} } = {}, endpoint: apiEndpoint } = config;

        const apiBase = config.baseUrlOverride || templateApiBase;

        const base = apiBase?.substr(-1) === '/' ? apiBase.slice(0, -1) : apiBase;
        let endpoint = apiEndpoint.charAt(0) === '/' ? apiEndpoint.slice(1) : apiEndpoint;

        if (config.template.auth_mode === 'API_KEY' && 'proxy' in config.template && 'query' in config.template.proxy) {
            const apiKeyProp = Object.keys(config.template.proxy.query)[0];
            const token = config.token as ApiKeyCredentials;
            endpoint += endpoint.includes('?') ? '&' : '?';
            endpoint += `${apiKeyProp}=${token.apiKey}`;
        }

        const fullEndpoint = interpolateIfNeeded(
            `${mapProxyBaseUrlInterpolationFormat(base)}${endpoint ? '/' : ''}${endpoint}`,
            connectionCopyWithParsedConnectionConfig(connection) as unknown as Record<string, string>
        );

        return fullEndpoint;
    }

    /**
     * Construct Headers
     * @param {ApplicationConstructedProxyConfiguration} config
     */
    public constructHeaders(config: ApplicationConstructedProxyConfiguration) {
        let headers = {};

        switch (config.template.auth_mode) {
            case 'BASIC':
                {
                    const token = config.token as BasicApiCredentials;
                    headers = {
                        Authorization: `Basic ${Buffer.from(`${token.username}:${token.password ?? ''}`).toString('base64')}`
                    };
                }
                break;
            case 'API_KEY':
                headers = {};
                break;
            default:
                headers = {
                    Authorization: `Bearer ${config.token}`
                };
                break;
        }

        // even if the auth mode isn't api key a header might exist in the proxy
        // so inject it if so
        if ('proxy' in config.template && 'headers' in config.template.proxy) {
            headers = Object.entries(config.template.proxy.headers).reduce(
                (acc: Record<string, string>, [key, value]: [string, string]) => {
                    // allows oauth2 acessToken key to be interpolated and injected
                    // into the header in addition to api key values
                    let tokenPair;
                    switch (config.template.auth_mode) {
                        case 'OAUTH2':
                            tokenPair = { accessToken: config.token };
                            break;
                        case 'API_KEY':
                        case 'OAUTH2_CC':
                            if (value.includes('connectionConfig')) {
                                value = value.replace(/connectionConfig\./g, '');
                                tokenPair = config.connection.connection_config;
                            } else {
                                tokenPair = config.token;
                            }
                            break;
                        default:
                            tokenPair = config.token;
                            break;
                    }
                    acc[key] = interpolateIfNeeded(value, tokenPair as unknown as Record<string, string>);
                    return acc;
                },
                { ...headers }
            );
        }

        if (config.headers) {
            const { headers: configHeaders } = config;
            headers = { ...headers, ...configHeaders };
        }

        return headers;
    }

    private handleResponse(config: ApplicationConstructedProxyConfiguration, url: string): Logs {
        const safeHeaders = this.stripSensitiveHeaders(config.headers, config);

        return {
            logs: [
                {
                    level: 'info',
                    createdAt: new Date().toISOString(),
                    message: `${config.method.toUpperCase()} request to ${url} was successful`,
                    meta: {
                        headers: JSON.stringify(safeHeaders)
                    }
                }
            ]
        };
    }

    private reportError(error: AxiosError, config: ApplicationConstructedProxyConfiguration, errorMessage: string): LogsBuffer[] {
        const safeHeaders = this.stripSensitiveHeaders(config.headers, config);
        return [
            {
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `The provider responded back with an error "${error.response?.status}"`,
                meta: {
                    errorMessage,
                    requestHeaders: safeHeaders,
                    responseHeaders: error.response?.headers
                }
            }
        ];
    }

    private handleErrorResponse(error: AxiosError, url: string, config: ApplicationConstructedProxyConfiguration): RouteResponse & Logs {
        const logs: LogsBuffer[] = [];
        if (!error.response?.data) {
            const {
                message,
                stack,
                config: { method },
                code,
                status
            } = error.toJSON() as any;

            const errorObject = { message, stack, code, status, url, method };

            logs.push({
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `${method.toUpperCase()} request to ${url} failed`,
                error: errorObject as any
            });

            logs.push(...this.reportError(error, config, message));
        } else {
            const {
                message,
                config: { method }
            } = error.toJSON() as any;
            const errorData = error.response.data;

            logs.push({
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `${method.toUpperCase()} request to ${url} failed`,
                error: (errorData as any).error || (errorData as any)
            });

            logs.push(...this.reportError(error, config, message));
        }

        return {
            response: error,
            logs
        };
    }
}

export default new ProxyService();
