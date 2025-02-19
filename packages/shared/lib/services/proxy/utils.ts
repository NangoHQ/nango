import OAuth from 'oauth-1.0a';
import * as crypto from 'node:crypto';
import type { Result } from '@nangohq/utils';
import { SIGNATURE_METHOD, Err, Ok } from '@nangohq/utils';
import FormData from 'form-data';
import type { TbaCredentials, ApiKeyCredentials, BasicApiCredentials, TableauCredentials } from '../../models/Auth.js';

import { interpolateIfNeeded, connectionCopyWithParsedConnectionConfig, mapProxyBaseUrlInterpolationFormat } from '../../utils/utils.js';
import { getProvider } from '../providers.js';
import type { ApplicationConstructedProxyConfiguration, HTTP_METHOD, InternalProxyConfiguration, UserProvidedProxyConfiguration } from '@nangohq/types';

type ProxyErrorCode =
    | 'missing_api_url'
    | 'missing_connection_id'
    | 'missing_provider'
    | 'unsupported_auth'
    | 'unknown_provider'
    | 'unsupported_provider'
    | 'invalid_query_params'
    | 'unknown_error';

export class ProxyError extends Error {
    code: ProxyErrorCode;
    constructor(code: ProxyErrorCode, message?: string, cause?: unknown) {
        super(message || code, { cause });
        this.code = code;
    }
}

export function getProxyConfiguration({
    externalConfig,
    internalConfig
}: {
    externalConfig: ApplicationConstructedProxyConfiguration | UserProvidedProxyConfiguration;
    internalConfig: InternalProxyConfiguration;
}): Result<ApplicationConstructedProxyConfiguration, ProxyError> {
    const { endpoint: passedEndpoint, providerConfigKey, connectionId, method, retries, headers, baseUrlOverride, retryOn } = externalConfig;
    const { connection, providerName } = internalConfig;
    let data = externalConfig.data;

    if (!passedEndpoint && !baseUrlOverride) {
        return Err(new ProxyError('missing_api_url'));
    }
    if (!connectionId) {
        return Err(new ProxyError('missing_connection_id'));
    }
    if (!providerConfigKey) {
        return Err(new ProxyError('missing_provider'));
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
            return Err(new ProxyError('unsupported_auth', 'OAuth1 is not supported'));
        }
        case 'APP_STORE':
        case 'CUSTOM':
        case 'TBA':
        case undefined:
        case 'BILL': {
            break;
        }
        default: {
            return Err(new ProxyError('unsupported_auth', `${(connection.credentials as any).type} is not supported`));
        }
    }

    const provider = getProvider(providerName);
    if (!provider) {
        return Err(new ProxyError('unknown_provider'));
    }

    if (!provider || ((!provider.proxy || !provider.proxy.base_url) && !baseUrlOverride)) {
        return Err(new ProxyError('unsupported_provider'));
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
        decompress: externalConfig.decompress === 'true' || externalConfig.decompress === true,
        connection,
        params: externalConfig.params as Record<string, string>, // TODO: fix this
        responseType: externalConfig.responseType,
        retryOn: retryOn && Array.isArray(retryOn) ? retryOn.map(Number) : null
    };

    return Ok(configBody);
}

/**
 * Construct URL
 * @param {ApplicationConstructedProxyConfiguration} config
 *
 */
export function buildProxyURL(config: ApplicationConstructedProxyConfiguration) {
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
    const endpoint = apiEndpoint.charAt(0) === '/' ? apiEndpoint.slice(1) : apiEndpoint;

    const fullEndpoint = interpolateIfNeeded(
        `${mapProxyBaseUrlInterpolationFormat(base)}${endpoint ? '/' : ''}${endpoint}`,
        connectionCopyWithParsedConnectionConfig(connection) as unknown as Record<string, string>
    );

    let url = new URL(fullEndpoint);
    if (config.params) {
        if (typeof config.params === 'string') {
            if (fullEndpoint.includes('?')) {
                throw new ProxyError('invalid_query_params', 'Can not set query params in endpoint and in params');
            }
            url = new URL(`${fullEndpoint}${config.params.startsWith('?') ? config.params : `?${config.params}`}`);
        } else {
            for (const [k, v] of Object.entries(config.params)) {
                url.searchParams.set(k, v as string);
            }
        }
    }

    if (config.provider.auth_mode === 'API_KEY' && 'proxy' in config.provider && 'query' in config.provider.proxy) {
        const apiKeyProp = Object.keys(config.provider.proxy.query)[0];
        const token = config.token as ApiKeyCredentials;
        url.searchParams.set(apiKeyProp!, token.apiKey);
    }

    return url.toString();
}

/**
 * Build Headers for proxy
 */
export function buildProxyHeaders(config: ApplicationConstructedProxyConfiguration, url: string): Record<string, string> {
    let headers = {};

    switch (config.provider.auth_mode) {
        case 'BASIC':
            {
                const token = config.token as BasicApiCredentials;
                headers = {
                    authorization: `Basic ${Buffer.from(`${token.username}:${token.password ?? ''}`).toString('base64')}`
                };
            }
            break;
        case 'TABLEAU':
            {
                const token = config.token as TableauCredentials;
                headers = {
                    'x-tableau-auth': token
                };
            }
            break;
        case 'API_KEY':
            headers = {};
            break;
        default:
            headers = {
                authorization: `Bearer ${config.token as string}`
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
            method: config.method
        };

        const token = {
            key: accessToken,
            secret: accessTokenSecret
        };

        const authHeaders = oauth.toHeader(oauth.authorize(requestData, token));

        // splice in the realm into the header
        let realm = config.connection.connection_config['accountId'];
        realm = realm.replace('-', '_').toUpperCase();

        headers = { authorization: authHeaders.Authorization.replace('OAuth ', `OAuth realm="${realm}", `) };
    }

    if (config.headers) {
        // Headers set in scripts should override the default ones
        headers = { ...headers, ...config.headers };
    }

    return headers;
}
