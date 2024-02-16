import axios, { AxiosError, AxiosResponse, AxiosRequestConfig, ParamsSerializerOptions } from 'axios';
import { backOff } from 'exponential-backoff';
import FormData from 'form-data';
import { ApiKeyCredentials, BasicApiCredentials, AuthModes, OAuth2Credentials } from '../models/Auth.js';
import type { HTTP_VERB, ServiceResponse } from '../models/Generic.js';
import type { ResponseType, ApplicationConstructedProxyConfiguration, UserProvidedProxyConfiguration, InternalProxyConfiguration } from '../models/Proxy.js';

import configService from './config.service.js';
import { interpolateIfNeeded, connectionCopyWithParsedConnectionConfig, mapProxyBaseUrlInterpolationFormat } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';
import type { ActivityLogMessage } from '../models/Activity.js';
import type { Template as ProviderTemplate } from '../models/Provider.js';

interface Activities {
    activityLogs: ActivityLogMessage[];
}

interface RouteResponse {
    response: AxiosResponse | AxiosError;
}
interface RetryHandlerResponse {
    shouldRetry: boolean;
}

class ProxyService {
    public async route(
        externalConfig: ApplicationConstructedProxyConfiguration | UserProvidedProxyConfiguration,
        internalConfig: InternalProxyConfiguration
    ): Promise<RouteResponse & Activities> {
        const { success, error, response: proxyConfig, activityLogs: configureActivityLogs } = this.configure(externalConfig, internalConfig);
        if (!success || error || !proxyConfig) {
            throw new Error(`Proxy configuration is missing: ${error}`);
        }
        return await this.sendToHttpMethod(proxyConfig, internalConfig).then((resp) => {
            return { response: resp.response, activityLogs: [...configureActivityLogs, ...resp.activityLogs] };
        });
    }

    public configure(
        externalConfig: ApplicationConstructedProxyConfiguration | UserProvidedProxyConfiguration,
        internalConfig: InternalProxyConfiguration
    ): ServiceResponse<ApplicationConstructedProxyConfiguration> & Activities {
        const activityLogs: ActivityLogMessage[] = [];
        let data = externalConfig.data;
        const { endpoint: passedEndpoint, providerConfigKey, connectionId, method, retries, headers, baseUrlOverride } = externalConfig;
        const { connection, provider, existingActivityLogId: activityLogId } = internalConfig;

        if (!passedEndpoint && !baseUrlOverride) {
            if (activityLogId) {
                activityLogs.push({
                    level: 'error',
                    environment_id: connection.environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: 'Proxy: a API URL endpoint is missing.'
                });
            }
            return { success: false, error: new NangoError('missing_endpoint'), response: null, activityLogs };
        }
        if (!connectionId) {
            if (activityLogId) {
                activityLogs.push({
                    level: 'error',
                    environment_id: connection.environment_id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `The connection id value is missing. If you're making a HTTP request then it should be included in the header 'Connection-Id'. If you're using the SDK the connectionId property should be specified.`
                });
            }
            return { success: false, error: new NangoError('missing_connection_id'), response: null, activityLogs };
        }
        if (!providerConfigKey) {
            if (activityLogId) {
                activityLogs.push({
                    level: 'error',
                    environment_id: connection.environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: `The provider config key value is missing. If you're making a HTTP request then it should be included in the header 'Provider-Config-Key'. If you're using the SDK the providerConfigKey property should be specified.`
                });
            }
            return { success: false, error: new NangoError('missing_provider_config_key'), response: null, activityLogs };
        }

        if (activityLogId) {
            activityLogs.push({
                level: 'debug',
                environment_id: connection.environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content: `Connection id: '${connectionId}' and provider config key: '${providerConfigKey}' parsed and received successfully`
            });
        }

        let endpoint = passedEndpoint;

        let token;
        switch (connection.credentials?.type) {
            case AuthModes.OAuth2:
                {
                    const credentials = connection.credentials as OAuth2Credentials;
                    token = credentials?.access_token;
                }
                break;
            case AuthModes.OAuth1: {
                const error = new Error('OAuth1 is not supported yet in the proxy.');
                const nangoError = new NangoError('pass_through_error', error);
                return { success: false, error: nangoError, response: null, activityLogs };
            }
            case AuthModes.Basic:
                token = connection.credentials;
                break;
            case AuthModes.ApiKey:
                token = connection.credentials;
                break;
            case AuthModes.App:
                {
                    const credentials = connection.credentials;
                    token = credentials?.access_token;
                }
                break;
        }

        activityLogs.push({
            level: 'debug',
            environment_id: connection.environment_id,
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content: 'Proxy: token retrieved successfully'
        });

        let template: ProviderTemplate | undefined;
        try {
            template = configService.getTemplate(provider);
        } catch (error) {}

        if (!template || ((!template.proxy || !template.proxy.base_url) && !baseUrlOverride)) {
            activityLogs.push({
                level: 'error',
                environment_id: connection.environment_id,
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `${Date.now()} The proxy is not supported for this provider ${provider}. You can easily add support by following the instructions at https://docs.nango.dev/contribute/nango-auth.
            You can also use the baseUrlOverride to get started right away.
            See https://docs.nango.dev/guides/proxy#proxy-requests for more information.`
            });

            return { success: false, error: new NangoError('missing_base_api_url'), response: null, activityLogs };
        }

        activityLogs.push({
            level: 'debug',
            environment_id: connection.environment_id,
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content: `Proxy: API call configuration constructed successfully with the base api url set to ${baseUrlOverride || template.proxy.base_url}`
        });

        if (!baseUrlOverride && template.proxy.base_url && endpoint.includes(template.proxy.base_url)) {
            endpoint = endpoint.replace(template.proxy.base_url, '');
        }

        activityLogs.push({
            level: 'debug',
            environment_id: connection.environment_id,
            activity_log_id: activityLogId as number,
            timestamp: Date.now(),
            content: `Endpoint set to ${endpoint} with retries set to ${retries}`
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
            responseType: externalConfig.responseType as ResponseType
        };

        return { success: true, error: null, response: configBody, activityLogs };
    }

    public retryHandler = async (
        activityLogId: number,
        environment_id: number,
        error: AxiosError,
        type: 'at' | 'after',
        retryHeader: string
    ): Promise<RetryHandlerResponse & Activities> => {
        if (type === 'at') {
            const resetTimeEpoch = error?.response?.headers[retryHeader] || error?.response?.headers[retryHeader.toLowerCase()];

            if (resetTimeEpoch) {
                const currentEpochTime = Math.floor(Date.now() / 1000);
                const retryAtEpoch = Number(resetTimeEpoch);

                if (retryAtEpoch > currentEpochTime) {
                    const waitDuration = retryAtEpoch - currentEpochTime;

                    const content = `Rate limit reset time was parsed successfully, retrying after ${waitDuration} seconds`;

                    const activityLogs: ActivityLogMessage[] = [
                        {
                            level: 'error',
                            environment_id,
                            activity_log_id: activityLogId,
                            timestamp: Date.now(),
                            content
                        }
                    ];

                    await new Promise((resolve) => setTimeout(resolve, waitDuration * 1000));

                    return { shouldRetry: true, activityLogs: activityLogs };
                }
            }
        }

        if (type === 'after') {
            const retryHeaderVal = error?.response?.headers[retryHeader] || error?.response?.headers[retryHeader.toLowerCase()];

            if (retryHeaderVal) {
                const retryAfter = Number(retryHeaderVal);
                const content = `Retry header was parsed successfully, retrying after ${retryAfter} seconds`;

                const activityLogs: ActivityLogMessage[] = [
                    {
                        level: 'error',
                        environment_id,
                        activity_log_id: activityLogId,
                        timestamp: Date.now(),
                        content
                    }
                ];

                await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));

                return { shouldRetry: true, activityLogs: activityLogs };
            }
        }

        return { shouldRetry: true, activityLogs: [] };
    };

    /**
     * Retry
     * @desc if retries are set the retry function to determine if retries are
     * actually kicked off or not
     * @param {AxiosError} error
     * @param {attemptNumber} number
     */
    public retry = async (
        activityLogId: number,
        environment_id: number,
        config: ApplicationConstructedProxyConfiguration,
        activityLogs: ActivityLogMessage[],
        error: AxiosError,
        attemptNumber: number
    ): Promise<boolean> => {
        if (
            error?.response?.status.toString().startsWith('5') ||
            // Note that Github issues a 403 for both rate limits and improper scopes
            (error?.response?.status === 403 &&
                error?.response?.headers['x-ratelimit-remaining'] &&
                error?.response?.headers['x-ratelimit-remaining'] === '0') ||
            error?.response?.status === 429 ||
            ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(error?.code as string)
        ) {
            if (config.retryHeader) {
                const type = config.retryHeader.at ? 'at' : 'after';
                const retryHeader = config.retryHeader.at ? config.retryHeader.at : config.retryHeader.after;

                const { shouldRetry, activityLogs: retryActivityLogs } = await this.retryHandler(
                    activityLogId,
                    environment_id,
                    error,
                    type,
                    retryHeader as string
                );
                retryActivityLogs.forEach((a: ActivityLogMessage) => activityLogs.push(a));
                return shouldRetry;
            }

            if (config.template.proxy && config.template.proxy.retry && (config.template.proxy?.retry?.at || config.template.proxy?.retry?.after)) {
                const type = config.template.proxy.retry.at ? 'at' : 'after';
                const retryHeader = config.template.proxy.retry.at ? config.template.proxy.retry.at : config.template.proxy.retry.after;

                const { shouldRetry, activityLogs: retryActivityLogs } = await this.retryHandler(
                    activityLogId,
                    environment_id,
                    error,
                    type,
                    retryHeader as string
                );
                retryActivityLogs.forEach((a: ActivityLogMessage) => activityLogs.push(a));
                return shouldRetry;
            }

            const content = `API received an ${error?.response?.status || error?.code} error, ${
                config.retries && config.retries > 0
                    ? `retrying with exponential backoffs for a total of ${attemptNumber} out of ${config.retries} times`
                    : 'but no retries will occur because retries defaults to 0 or were set to 0'
            }`;

            activityLogs.push({
                level: 'error',
                environment_id,
                activity_log_id: activityLogId,
                timestamp: Date.now(),
                content
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
    private sendToHttpMethod(
        configBody: ApplicationConstructedProxyConfiguration,
        internalConfig: InternalProxyConfiguration
    ): Promise<RouteResponse & Activities> {
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

        const { existingActivityLogId: activityLogId, connection } = internalConfig;
        const { method } = configBody;

        options.url = this.constructUrl(configBody);
        options.method = method;

        const headers = this.constructHeaders(configBody);
        options.headers = { ...options.headers, ...headers };

        return this.request(configBody, activityLogId as number, connection.environment_id, options);
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

    private async request(
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number,
        environment_id: number,
        options: AxiosRequestConfig
    ): Promise<RouteResponse & Activities> {
        const activityLogs: ActivityLogMessage[] = [];
        try {
            const response: AxiosResponse = await backOff(
                () => {
                    return axios.request(options);
                },
                { numOfAttempts: Number(config.retries), retry: this.retry.bind(this, activityLogId, environment_id, config, activityLogs) }
            );
            return this.handleResponse(response, config, activityLogId, environment_id, options.url!).then((resp) => {
                return { response: resp.response, activityLogs: [...activityLogs, ...resp.activityLogs] };
            });
        } catch (e: unknown) {
            return this.handleErrorResponse(e as AxiosError, options.url!, config, activityLogId, environment_id).then((resp) => {
                return { response: resp.response, activityLogs: [...activityLogs, ...resp.activityLogs] };
            });
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
        let endpoint = apiEndpoint?.charAt(0) === '/' ? apiEndpoint.slice(1) : apiEndpoint;

        if (config.template.auth_mode === AuthModes.ApiKey && 'proxy' in config.template && 'query' in config.template.proxy) {
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
            case AuthModes.Basic:
                {
                    const token = config.token as BasicApiCredentials;
                    headers = {
                        Authorization: `Basic ${Buffer.from(`${token.username}:${token.password ?? ''}`).toString('base64')}`
                    };
                }
                break;
            case AuthModes.ApiKey:
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
                        case AuthModes.OAuth2:
                            tokenPair = { accessToken: config.token };
                            break;
                        case AuthModes.ApiKey:
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

    private async handleResponse(
        response: AxiosResponse,
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number,
        environment_id: number,
        url: string
    ): Promise<RouteResponse & Activities> {
        const safeHeaders = this.stripSensitiveHeaders(config.headers, config);

        const activityLog: ActivityLogMessage = {
            level: 'info',
            environment_id,
            activity_log_id: activityLogId,
            timestamp: Date.now(),
            content: `${config.method.toUpperCase()} request to ${url} was successful`,
            params: {
                headers: JSON.stringify(safeHeaders)
            }
        };

        return {
            response,
            activityLogs: [activityLog]
        };
    }

    private reportError(
        error: AxiosError,
        url: string,
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number,
        environment_id: number,
        errorMessage: string
    ): ActivityLogMessage[] {
        const activities: ActivityLogMessage[] = [];
        if (activityLogId) {
            const safeHeaders = this.stripSensitiveHeaders(config.headers, config);
            activities.push({
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
        return activities;
    }

    private async handleErrorResponse(
        error: AxiosError,
        url: string,
        config: ApplicationConstructedProxyConfiguration,
        activityLogId: number,
        environment_id: number
    ): Promise<RouteResponse & Activities> {
        const activityLogs: ActivityLogMessage[] = [];
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
                activityLogs.push({
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

            activityLogs.push(...this.reportError(error, url, config, activityLogId, environment_id, message));
        } else {
            const {
                message,
                config: { method }
            } = error?.toJSON() as any;
            const errorData = error?.response?.data;

            if (activityLogId) {
                activityLogs.push({
                    level: 'error',
                    environment_id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: `${method.toUpperCase()} request to ${url} failed`,
                    params: JSON.stringify((errorData as any).error || errorData, null, 2) as any
                });
            } else {
                console.error(`Error: ${method.toUpperCase()} request to ${url} failed with the following params: ${JSON.stringify(errorData)}`);
            }

            activityLogs.push(...this.reportError(error, url, config, activityLogId, environment_id, message));
        }

        return {
            response: error,
            activityLogs
        };
    }
}

export default new ProxyService();
