import https from 'https';
import * as crypto from 'node:crypto';

import FormData from 'form-data';
import OAuth from 'oauth-1.0a';

import { Err, Ok, SIGNATURE_METHOD } from '@nangohq/utils';

import { connectionCopyWithParsedConnectionConfig, formatPem, interpolateIfNeeded, interpolateProxyUrlParts } from '../../utils/utils.js';
import { getProvider } from '../providers.js';

import type {
    ApplicationConstructedProxyConfiguration,
    ConnectionForProxy,
    HTTP_METHOD,
    IntegrationConfigForProxy,
    InternalProxyConfiguration,
    OAuth2ClientCredentials,
    ProviderOAuth1,
    UserProvidedProxyConfiguration
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { AxiosRequestConfig } from 'axios';

type ProxyErrorCode =
    | 'missing_api_url'
    | 'missing_provider'
    | 'unsupported_auth'
    | 'unknown_provider'
    | 'unsupported_provider'
    | 'invalid_query_params'
    | 'unknown_error'
    | 'failed_to_get_connection'
    | 'invalid_certificate_or_key_format';

export interface RetryReason {
    retry: boolean;
    reason: string;
    wait?: number;
}

export class ProxyError extends Error {
    code: ProxyErrorCode;
    constructor(code: ProxyErrorCode, message?: string, cause?: unknown) {
        super(message || code, { cause });
        this.code = code;
    }
}

const methodDataAllowed = ['POST', 'PUT', 'PATCH', 'DELETE'];
const providedHeaders: Lowercase<string>[] = ['user-agent'];

export function getAxiosConfiguration({
    proxyConfig,
    connection,
    integrationConfig
}: {
    proxyConfig: ApplicationConstructedProxyConfiguration;
    connection: ConnectionForProxy;
    integrationConfig?: IntegrationConfigForProxy | undefined;
}): AxiosRequestConfig {
    const url = buildProxyURL({ config: proxyConfig, connection });
    const headers = buildProxyHeaders({ config: proxyConfig, url, connection, integrationConfig });

    const axiosConfig: AxiosRequestConfig = {
        method: proxyConfig.method,
        url,
        headers,
        beforeRedirect: (options: Record<string, any>) => {
            // keep all headers from the original nango request, especially authorization as its dropped with axios follow-redirects
            Object.keys(headers).forEach((key) => {
                if (headers[key]) {
                    options['headers'][key] = headers[key];
                }
            });
        }
    };

    if (proxyConfig.responseType) {
        axiosConfig.responseType = proxyConfig.responseType;
    }

    if (proxyConfig.data && methodDataAllowed.includes(proxyConfig.method)) {
        axiosConfig.data = proxyConfig.data;
    }

    if (proxyConfig.decompress || proxyConfig.provider.proxy?.decompress === true) {
        axiosConfig.decompress = true;
    }

    if (proxyConfig.provider.require_client_certificate) {
        const { client_certificate, client_private_key } = connection.credentials as OAuth2ClientCredentials;

        if (client_certificate && client_private_key) {
            try {
                const cert = formatPem(client_certificate, 'CERTIFICATE');
                const key = formatPem(client_private_key, 'PRIVATE KEY');

                if (
                    !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\n?$/.test(cert) ||
                    !/^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----\n?$/.test(key)
                ) {
                    throw new ProxyError(
                        'invalid_certificate_or_key_format',
                        'Certificate and private key must be in PEM format with proper BEGIN/END boundaries'
                    );
                }

                const agent = new https.Agent({
                    cert,
                    key,
                    rejectUnauthorized: false
                });

                axiosConfig.httpAgent = agent;
                axiosConfig.httpsAgent = agent;
            } catch (err: any) {
                throw new ProxyError(
                    'invalid_certificate_or_key_format',
                    `Certificate and private key must be in PEM format with proper BEGIN/END boundaries: ${err}`
                );
            }
        }
    }

    return axiosConfig;
}

export function getProxyConfiguration({
    externalConfig,
    internalConfig
}: {
    externalConfig: ApplicationConstructedProxyConfiguration | UserProvidedProxyConfiguration;
    internalConfig: InternalProxyConfiguration;
}): Result<ApplicationConstructedProxyConfiguration, ProxyError> {
    const { endpoint: passedEndpoint, providerConfigKey, method, retries, headers, baseUrlOverride, retryOn } = externalConfig;
    const { providerName } = internalConfig;
    let data = externalConfig.data;

    if (!passedEndpoint && !baseUrlOverride) {
        return Err(new ProxyError('missing_api_url'));
    }
    if (!providerConfigKey) {
        return Err(new ProxyError('missing_provider'));
    }

    let endpoint = passedEndpoint;

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
        method: method ? (method.toUpperCase() as HTTP_METHOD) : 'GET',
        provider,
        providerName,
        providerConfigKey,
        headers: headersCleaned,
        data,
        retries: retries || 0,
        baseUrlOverride: baseUrlOverride as string,
        // decompress is used only when the call is truly a proxy call
        // Coming from a flow it is not a proxy call since the worker
        // makes the request so we don't allow an override in that case
        decompress: externalConfig.decompress === 'true' || externalConfig.decompress === true,
        params: externalConfig.params as Record<string, string>, // TODO: fix this
        responseType: externalConfig.responseType,
        retryOn: retryOn && Array.isArray(retryOn) ? retryOn.map(Number) : null
    };

    return Ok(configBody);
}

/**
 * Construct URL
 */
export function buildProxyURL({ config, connection }: { config: ApplicationConstructedProxyConfiguration; connection: ConnectionForProxy }) {
    const { provider: { proxy: { base_url: templateApiBase } = {} } = {}, endpoint: apiEndpoint } = config;

    let apiBase = config.baseUrlOverride || templateApiBase;

    if (apiBase?.includes('${') && apiBase?.includes('||')) {
        const connectionConfig = connection.connection_config;
        const splitApiBase = apiBase.split(/\s*\|\|\s*/);

        const keyMatch = apiBase.match(/connectionConfig\.(\w+)/);
        const index = keyMatch && keyMatch[1] && connectionConfig[keyMatch[1]] ? 0 : 1;
        apiBase = splitApiBase[index]?.trim();
    }

    const normalizedBase = apiBase?.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    const normalizedEndpoint = apiEndpoint.startsWith('/') ? apiEndpoint.slice(1) : apiEndpoint;

    const baseFormatted = interpolateProxyUrlParts(normalizedBase);
    const endpointFormatted = normalizedEndpoint ? interpolateProxyUrlParts(normalizedEndpoint) : '';

    const combinedUrl = [baseFormatted, endpointFormatted].filter(Boolean).join('/');
    const fullEndpoint = interpolateIfNeeded(combinedUrl, connectionCopyWithParsedConnectionConfig(connection) as unknown as Record<string, string>);

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

    if (config.provider?.proxy?.query) {
        for (const [key, value] of Object.entries(config.provider.proxy.query)) {
            if (typeof value !== 'string') {
                continue;
            }
            if (connection.credentials.type === 'API_KEY' && value === '${apiKey}') {
                url.searchParams.set(key, connection.credentials.apiKey);
            } else if (value.includes('connectionConfig.')) {
                const interpolatedValue = interpolateIfNeeded(value.replace(/connectionConfig\./g, ''), connection.connection_config);

                if (interpolatedValue && !interpolatedValue.includes('${')) {
                    url.searchParams.set(key, interpolatedValue);
                }
            } else if (!value.includes('$')) {
                url.searchParams.set(key, value);
            }
        }
    }
    return url.toString();
}

/**
 * Build Headers for proxy
 */
export function buildProxyHeaders({
    config,
    url,
    connection,
    integrationConfig
}: {
    config: ApplicationConstructedProxyConfiguration;
    url: string;
    connection: ConnectionForProxy;
    integrationConfig?: IntegrationConfigForProxy | undefined;
}): Record<string, string> {
    let headers: Record<Lowercase<string>, string> = {};

    switch (connection.credentials.type) {
        case 'BASIC': {
            headers['authorization'] = `Basic ${Buffer.from(`${connection.credentials.username}:${connection.credentials.password ?? ''}`).toString('base64')}`;
            break;
        }
        case 'OAUTH2':
        case 'APP_STORE':
        case 'APP': {
            headers['authorization'] = `Bearer ${connection.credentials.access_token}`;
            break;
        }
        case 'API_KEY': {
            // A lot of API_KEY provider have a dedicated header so we can't assume a default
            break;
        }
        case 'OAUTH2_CC':
        case 'SIGNATURE':
        case 'JWT': {
            headers['authorization'] = `Bearer ${connection.credentials.token}`;
            break;
        }
        case 'TWO_STEP': {
            // For TWO_STEP, check if custom headers will handle authorization
            // Only set default Bearer if no custom authorization header is configured
            const hasCustomAuthHeader =
                'proxy' in config.provider &&
                'headers' in config.provider.proxy &&
                Object.values(config.provider.proxy.headers).some((header) => typeof header === 'string' && header.includes('${accessToken}'));

            if (!hasCustomAuthHeader) {
                headers['authorization'] = `Bearer ${connection.credentials.token}`;
            }
            break;
        }
        case 'TBA': {
            const credentials = connection.credentials;
            const consumerKey: string = credentials.config_override?.client_id || connection.connection_config['oauth_client_id'];
            const consumerSecret: string = credentials.config_override?.client_secret || connection.connection_config['oauth_client_secret'];
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
            let realm = connection.connection_config['accountId'];
            realm = realm.replace('-', '_').toUpperCase();

            headers['authorization'] = authHeaders.Authorization.replace('OAuth ', `OAuth realm="${realm}", `);
            break;
        }
        case 'CUSTOM':
        case undefined:
        case 'BILL': {
            break;
        }
        case 'OAUTH1': {
            const credentials = connection.credentials;
            const consumerKey = integrationConfig?.oauth_client_id;
            const consumerSecret = integrationConfig?.oauth_client_secret;

            if (!consumerKey || !consumerSecret) {
                throw new ProxyError('unsupported_auth', 'OAuth1 requires oauth_client_id and oauth_client_secret in integration config');
            }

            const accessToken = credentials.oauth_token;
            const accessTokenSecret = credentials.oauth_token_secret;

            const oauth = new OAuth({
                consumer: { key: consumerKey, secret: consumerSecret },
                signature_method: config.provider ? (config.provider as ProviderOAuth1).signature_method : SIGNATURE_METHOD,
                hash_function(baseString: string, key: string) {
                    return crypto.createHmac('sha1', key).update(baseString).digest('base64');
                }
            });

            const requestData = {
                url,
                method: config.method
            };

            const token = { key: accessToken, secret: accessTokenSecret };

            const authHeaders = oauth.toHeader(oauth.authorize(requestData, token));

            headers['authorization'] = authHeaders.Authorization;
            break;
        }
        default: {
            throw new ProxyError('unsupported_auth', `Auth "${(connection.credentials as any).type}" is not supported`);
        }
    }

    // Custom headers handling
    if ('proxy' in config.provider && 'headers' in config.provider.proxy) {
        for (const [key, value] of Object.entries(config.provider.proxy.headers) as [Lowercase<string>, string][]) {
            if (value.includes('connectionConfig')) {
                headers[key] = interpolateIfNeeded(value.replace(/connectionConfig\./g, ''), connection.connection_config);
                continue;
            }

            switch (connection.credentials.type) {
                case 'OAUTH2': {
                    headers[key] = interpolateIfNeeded(value, { accessToken: connection.credentials.access_token });
                    break;
                }
                case 'SIGNATURE': {
                    headers[key] = interpolateIfNeeded(value, { accessToken: connection.credentials.token || '' });
                    break;
                }
                case 'TWO_STEP': {
                    headers[key] = interpolateIfNeeded(value, { accessToken: connection.credentials.token || '', credentials: connection.credentials });
                    break;
                }
                case 'JWT': {
                    headers[key] = interpolateIfNeeded(value, { accessToken: connection.credentials.token || '' });
                    break;
                }
                default:
                    headers[key] = interpolateIfNeeded(value, connection.credentials as Record<string, string>);
                    break;
            }
        }
    }

    if (config.headers) {
        // Headers set in scripts should override the default ones except for special headers like 'user-agent'
        for (const key of providedHeaders) {
            if (headers[key]) {
                config.headers[key] = headers[key];
            }
        }

        headers = { ...headers, ...config.headers };
    }

    return headers;
}
