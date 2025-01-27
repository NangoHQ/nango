import { isAxiosError } from 'axios';
import type { AxiosError, AxiosResponse, AxiosRequestConfig, ParamsSerializerOptions } from 'axios';
import OAuth from 'oauth-1.0a';
import * as crypto from 'node:crypto';
import { axiosInstance as axios, SIGNATURE_METHOD, redactHeaders, redactURL } from '@nangohq/utils';
import { backOff } from 'exponential-backoff';
import FormData from 'form-data';
import type { TbaCredentials, ApiKeyCredentials, BasicApiCredentials, TableauCredentials } from '../models/Auth.js';
import type { HTTP_METHOD, ServiceResponse } from '../models/Generic.js';
import type { ResponseType, ApplicationConstructedProxyConfiguration, UserProvidedProxyConfiguration, InternalProxyConfiguration } from '../models/Proxy.js';

import { interpolateIfNeeded, connectionCopyWithParsedConnectionConfig, mapProxyBaseUrlInterpolationFormat } from '../utils/utils.js';
import { NangoError } from '../utils/error.js';
import type { MessageRowInsert, RetryHeaderConfig } from '@nangohq/types';
import { getProvider } from './providers.js';

interface Logs {
    logs: MessageRowInsert[];
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
        const logs: MessageRowInsert[] = [];
        let data = externalConfig.data;
        const { endpoint: passedEndpoint, providerConfigKey, connectionId, method, retries, headers, baseUrlOverride, retryOn } = externalConfig;
        const { connection, providerName } = internalConfig;

        if (!passedEndpoint && !baseUrlOverride) {
            logs.push({ type: 'log', level: 'error', createdAt: new Date().toISOString(), message: 'Proxy: a API URL endpoint is missing.' });
            return { success: false, error: new NangoError('missing_endpoint'), response: null, logs };
        }
        if (!connectionId) {
            logs.push({
                type: 'log',
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `The connection id value is missing. If you're making a HTTP request then it should be included in the header 'Connection-Id'. If you're using the SDK the connectionId property should be specified.`
            });
            return { success: false, error: new NangoError('missing_connection_id'), response: null, logs };
        }
        if (!providerConfigKey) {
            logs.push({
                type: 'log',
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `The provider config key value is missing. If you're making a HTTP request then it should be included in the header 'Provider-Config-Key'. If you're using the SDK the providerConfigKey property should be specified.`
            });
            return { success: false, error: new NangoError('missing_provider_config_key'), response: null, logs };
        }

        let endpoint = passedEndpoint;

        let token;
        switch (connection.credentials.type) {
            case 'OAUTH2':
            case 'APP': {
                const credentials = connection.credentials;
                token = credentials.access_token;
                break;
            }
            case 'OAUTH2_CC':
            case 'TWO_STEP':
            case 'TABLEAU':
            case 'JWT':
            case 'SIGNATURE': {
                const credentials = connection.credentials;
                token = credentials.token;
                break;
            }
            case 'BASIC':
            case 'API_KEY':
                token = connection.credentials;
                break;
            case 'OAUTH1': {
                const error = new Error('OAuth1 is not supported yet in the proxy.');
                const nangoError = new NangoError('pass_through_error', error);
                return { success: false, error: nangoError, response: null, logs };
            }
            case 'APP_STORE':
            case 'CUSTOM':
            case 'TBA':
            case undefined:
            case 'BILL': {
                break;
            }
            default: {
                throw new Error(`Unhandled connection.credentials for: ${(connection.credentials as any).type}`);
            }
        }

        const provider = getProvider(providerName);
        if (!provider) {
            logs.push({ type: 'log', level: 'error', createdAt: new Date().toISOString(), message: `Provider ${providerName} does not exist` });
            return { success: false, error: new NangoError('unknown_provider_template'), response: null, logs };
        }

        if (!provider || ((!provider.proxy || !provider.proxy.base_url) && !baseUrlOverride)) {
            logs.push({
                type: 'log',
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `The proxy is either not supported for the provider ${providerName} or it does not have a default base URL configured (use the baseUrlOverride config param to specify a base URL).`
            });

            return { success: false, error: new NangoError('missing_base_api_url'), response: null, logs };
        }

        if (!baseUrlOverride && provider.proxy?.base_url && endpoint.includes(provider.proxy.base_url)) {
            endpoint = endpoint.replace(provider.proxy.base_url, '');
        }

        const headersCleaned: Record<string, string> = {};
        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                headersCleaned[key.toLocaleLowerCase()] = value;
            }
        }

        if (headersCleaned['content-type'] === 'multipart/form-data') {
            const formData = new FormData();

            Object.keys(data as any).forEach((key) => {
                formData.append(key, (data as any)[key]);
            });
            for (const file of externalConfig.files || []) {
                formData.append(file.fieldname, file.buffer, {
                    filename: file.originalname,
                    contentType: file.mimetype
                });
            }

            data = formData;
        }

        const configBody: ApplicationConstructedProxyConfiguration = {
            endpoint,
            method: method?.toUpperCase() as HTTP_METHOD,
            provider,
            token: token || '',
            providerName,
            providerConfigKey,
            connectionId,
            headers: headersCleaned,
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
        const logs: MessageRowInsert[] = [];

        if (type === 'at') {
            const resetTimeEpoch = error.response?.headers[retryHeader] || error.response?.headers[retryHeader.toLowerCase()];

            if (resetTimeEpoch) {
                const currentEpochTime = Math.floor(Date.now() / 1000);
                const retryAtEpoch = Number(resetTimeEpoch);

                if (retryAtEpoch > currentEpochTime) {
                    const waitDuration = retryAtEpoch - currentEpochTime;

                    const content = `Rate limit reset time was parsed successfully, retrying after ${waitDuration} seconds`;

                    logs.push({
                        type: 'http',
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
                    type: 'http',
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
    public retry = async (
        config: ApplicationConstructedProxyConfiguration,
        logs: MessageRowInsert[],
        error: AxiosError,
        attemptNumber: number
    ): Promise<boolean> => {
        if (
            error.response?.status.toString().startsWith('5') ||
            this.isProviderSpecificErrorCode(config.provider.proxy?.retry, error) ||
            error.response?.status === 429 ||
            ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(error.code as string) ||
            config.retryOn?.includes(Number(error.response?.status))
        ) {
            if (config.retryHeader) {
                const type = config.retryHeader.at ? 'at' : 'after';
                const retryHeader = config.retryHeader.at ? config.retryHeader.at : config.retryHeader.after;

                const { shouldRetry, logs: retryActivityLogs } = await this.retryHandler(error, type, retryHeader as string);
                retryActivityLogs.forEach((l: MessageRowInsert) => logs.push(l));
                return shouldRetry;
            }

            if (config.provider.proxy && config.provider.proxy.retry && (config.provider.proxy.retry.at || config.provider.proxy.retry.after)) {
                const type = config.provider.proxy.retry.at ? 'at' : 'after';
                const retryHeader = config.provider.proxy.retry.at ? config.provider.proxy.retry.at : config.provider.proxy.retry.after;

                const { shouldRetry, logs: retryActivityLogs } = await this.retryHandler(error, type, retryHeader as string);
                retryActivityLogs.forEach((l: MessageRowInsert) => logs.push(l));
                return shouldRetry;
            }

            const content = `API received an ${error.response?.status || error.code} error, ${
                config.retries && config.retries > 0
                    ? `retrying with exponential backoffs for a total of ${attemptNumber} out of ${config.retries} times`
                    : 'but no retries will occur because retries defaults to 0 or were set to 0'
            }`;

            logs.push({
                type: 'http',
                level: 'error',
                createdAt: new Date().toISOString(),
                message: content
            });

            return true;
        }

        return false;
    };

    private isProviderSpecificErrorCode(retryConfig: RetryHeaderConfig | undefined, error: AxiosError): boolean {
        if (!retryConfig) {
            return false;
        }

        const { remaining, error_code } = retryConfig;

        if (!remaining || !error_code) {
            return false;
        }

        if (Number(error?.response?.status) === Number(error_code) && error.response?.headers[remaining] === '0') {
            return true;
        }

        return false;
    }

    /**
     * Send to http method
     * @desc route the call to a HTTP request based on HTTP method passed in
     * @param {ApplicationConstructedProxyConfiguration} configBody
     */
    private sendToHttpMethod(configBody: ApplicationConstructedProxyConfiguration): Promise<RouteResponse & Logs> {
        const options: AxiosRequestConfig = {};

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

        options.headers = this.constructHeaders(configBody, method, options.url);

        return this.request(configBody, options);
    }

    private async request(config: ApplicationConstructedProxyConfiguration, options: AxiosRequestConfig): Promise<RouteResponse & Logs> {
        const logs: MessageRowInsert[] = [];
        try {
            const response: AxiosResponse = await backOff(
                () => {
                    return axios.request(options);
                },
                { numOfAttempts: Number(config.retries), retry: this.retry.bind(this, config, logs) }
            );

            const handling = this.handleResponse({ response, config, requestConfig: options });
            return { response, logs: [...logs, ...handling.logs] };
        } catch (err) {
            const handling = this.handleErrorResponse({ error: err, requestConfig: options, config });
            return { response: err as any, logs: [...logs, ...handling.logs] };
        }
    }

    /**
     * Construct URL
     * @param {ApplicationConstructedProxyConfiguration} config
     *
     */
    public constructUrl(config: ApplicationConstructedProxyConfiguration) {
        const { connection } = config;
        const { provider: { proxy: { base_url: templateApiBase } = {} } = {}, endpoint: apiEndpoint } = config;

        let apiBase = config.baseUrlOverride || templateApiBase;

        if (apiBase?.includes('${') && apiBase?.includes('||')) {
            const connectionConfig = connection.connection_config;
            const splitApiBase = apiBase.split(/\s*\|\|\s*/);

            if (!connectionConfig) {
                apiBase = splitApiBase[1];
            } else {
                const keyMatch = apiBase.match(/connectionConfig\.(\w+)/);
                const index = keyMatch && keyMatch[1] && connectionConfig[keyMatch[1]] ? 0 : 1;
                apiBase = splitApiBase[index]?.trim();
            }
        }

        const base = apiBase?.substr(-1) === '/' ? apiBase.slice(0, -1) : apiBase;
        let endpoint = apiEndpoint.charAt(0) === '/' ? apiEndpoint.slice(1) : apiEndpoint;

        if (config.provider.auth_mode === 'API_KEY' && 'proxy' in config.provider && 'query' in config.provider.proxy) {
            const apiKeyProp = Object.keys(config.provider.proxy.query)[0];
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
     */
    public constructHeaders(config: ApplicationConstructedProxyConfiguration, method: HTTP_METHOD, url: string): Record<string, string> {
        let headers = {};

        switch (config.provider.auth_mode) {
            case 'BASIC':
                {
                    const token = config.token as BasicApiCredentials;
                    headers = {
                        Authorization: `Basic ${Buffer.from(`${token.username}:${token.password ?? ''}`).toString('base64')}`
                    };
                }
                break;
            case 'TABLEAU':
                {
                    const token = config.token as TableauCredentials;
                    headers = {
                        'X-tableau-Auth': token
                    };
                }
                break;
            case 'API_KEY':
                headers = {};
                break;
            default:
                headers = {
                    Authorization: `Bearer ${config.token as string}`
                };
                break;
        }

        // even if the auth mode isn't api key a header might exist in the proxy
        // so inject it if so
        if ('proxy' in config.provider && 'headers' in config.provider.proxy) {
            headers = Object.entries(config.provider.proxy.headers).reduce<Record<string, string>>(
                (acc, [key, value]) => {
                    // allows oauth2 accessToken key to be interpolated and injected
                    // into the header in addition to api key values
                    let tokenPair;
                    switch (config.provider.auth_mode) {
                        case 'OAUTH2':
                        case 'SIGNATURE':
                            if (value.includes('connectionConfig')) {
                                value = value.replace(/connectionConfig\./g, '');
                                tokenPair = config.connection.connection_config;
                            } else {
                                tokenPair = { accessToken: config.token };
                            }
                            break;
                        case 'BASIC':
                        case 'API_KEY':
                        case 'OAUTH2_CC':
                        case 'TABLEAU':
                        case 'TWO_STEP':
                        case 'JWT':
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

        if (config.provider.auth_mode === 'TBA') {
            const credentials = config.connection.credentials as TbaCredentials;
            const consumerKey: string = credentials.config_override['client_id'] || config.connection.connection_config['oauth_client_id'];
            const consumerSecret: string = credentials.config_override['client_secret'] || config.connection.connection_config['oauth_client_secret'];
            const accessToken = credentials['token_id'];
            const accessTokenSecret = credentials['token_secret'];

            const oauth = new OAuth({
                consumer: { key: consumerKey, secret: consumerSecret },
                signature_method: SIGNATURE_METHOD,
                hash_function(baseString: string, key: string) {
                    return crypto.createHmac('sha256', key).update(baseString).digest('base64');
                }
            });

            const requestData = {
                url,
                method
            };

            const token = {
                key: accessToken,
                secret: accessTokenSecret
            };

            const authHeaders = oauth.toHeader(oauth.authorize(requestData, token));

            // splice in the realm into the header
            let realm = config.connection.connection_config['accountId'];
            realm = realm.replace('-', '_').toUpperCase();

            authHeaders.Authorization = authHeaders.Authorization.replace('OAuth ', `OAuth realm="${realm}", `);

            headers = authHeaders;
        }

        if (config.headers) {
            // Headers set in scripts should override the default ones
            headers = { ...headers, ...config.headers };
        }

        return headers;
    }

    private handleResponse({
        response,
        config,
        requestConfig
    }: {
        response: AxiosResponse;
        config: ApplicationConstructedProxyConfiguration;
        requestConfig: AxiosRequestConfig;
    }): Logs {
        const valuesToFilter = Object.values(config.connection.credentials);
        const safeHeaders = redactHeaders({ headers: requestConfig.headers, valuesToFilter });
        const redactedURL = redactURL({ url: requestConfig.url!, valuesToFilter });
        return {
            logs: [
                {
                    type: 'http',
                    level: 'info',
                    createdAt: new Date().toISOString(),
                    message: `${config.method} ${redactedURL} was successful`,
                    request: {
                        method: config.method,
                        url: redactedURL,
                        headers: safeHeaders
                    },
                    response: {
                        code: response.status,
                        headers: (response.headers || {}) as Record<string, string>
                    }
                }
            ]
        };
    }

    private handleErrorResponse({
        error,
        requestConfig,
        config
    }: {
        error: unknown;
        requestConfig: AxiosRequestConfig;
        config: ApplicationConstructedProxyConfiguration;
    }): Logs {
        const logs: MessageRowInsert[] = [];

        const valuesToFilter = Object.values(config.connection.credentials);
        const redactedURL = redactURL({ url: requestConfig.url!, valuesToFilter });

        if (isAxiosError(error)) {
            const safeHeaders = redactHeaders({ headers: requestConfig.headers, valuesToFilter });
            logs.push({
                type: 'http',
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `${config.method} request to ${redactedURL} failed`,
                request: {
                    method: config.method,
                    url: redactedURL,
                    headers: safeHeaders
                },
                response: {
                    code: error.response?.status || 500,
                    headers: (error.response?.headers || {}) as Record<string, string>
                },
                error: {
                    name: error.name,
                    message: error.message,
                    payload: {
                        method: config.method,
                        stack: error.stack,
                        code: error.code,
                        status: error.status,
                        url: redactedURL,
                        data: error.response?.data,
                        safeHeaders
                    }
                }
            });
        } else {
            logs.push({
                type: 'http',
                level: 'error',
                createdAt: new Date().toISOString(),
                message: `${config.method} request to ${redactedURL} failed`,
                error: error as any
            });
        }

        return { logs };
    }
}

export default new ProxyService();
