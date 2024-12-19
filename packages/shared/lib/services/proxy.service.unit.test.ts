import { expect, describe, it } from 'vitest';
import proxyService from './proxy.service.js';
import type { UserProvidedProxyConfiguration, InternalProxyConfiguration, OAuth2Credentials } from '../models/index.js';
import type { ApplicationConstructedProxyConfiguration } from '../models/Proxy.js';
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Connection, MessageRowInsert, Provider } from '@nangohq/types';

function getDefaultConnection(): Connection {
    return {
        connection_id: 'a',
        created_at: new Date(),
        credentials: { type: 'API_KEY', apiKey: 'e' },
        end_user_id: null,
        environment_id: 1,
        provider_config_key: 'foobar',
        updated_at: new Date(),
        connection_config: {}
    };
}
function getDefaultProxy(
    override: Omit<Partial<ApplicationConstructedProxyConfiguration>, 'connection' | 'provider'> &
        Partial<{
            connection: Partial<ApplicationConstructedProxyConfiguration['connection']>;
            provider: Partial<ApplicationConstructedProxyConfiguration['provider']>;
        }>
): ApplicationConstructedProxyConfiguration {
    return {
        connectionId: 'a',
        endpoint: '/api/test',
        method: 'GET',
        providerConfigKey: 'foobar',
        providerName: 'github',
        token: '',
        ...override,
        provider: {
            auth_mode: 'API_KEY',
            display_name: 'test',
            docs: '',
            ...override.provider
        } as Provider,
        connection: { ...getDefaultConnection(), ...override.connection }
    };
}

describe('Proxy service Construct Header Tests', () => {
    it('Should correctly construct a header using an api key with multiple headers', () => {
        const config = getDefaultProxy({
            token: { apiKey: 'sweet-secret-token' },
            provider: {
                auth_mode: 'API_KEY',
                authorization_url: 'https://api.nangostarter.com',
                token_url: 'https://api.nangostarter.com',
                proxy: {
                    base_url: 'https://api.nangostarter.com',
                    headers: {
                        'My-Token': '${apiKey}',
                        'X-Test': 'test'
                    }
                }
            },
            connection: {
                connection_config: {
                    instance_url: 'bar'
                }
            }
        });

        const headers = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(headers).toEqual({
            'My-Token': 'sweet-secret-token',
            'X-Test': 'test'
        });
    });

    it('Should correctly construct headers for Basic auth', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC'
            },
            token: {
                username: 'testuser',
                password: 'testpassword'
            }
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            Authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64')
        });
    });

    it('Should correctly construct headers for Basic auth with no password', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC'
            },
            token: {
                username: 'testuser',
                password: ''
            }
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            Authorization: 'Basic ' + Buffer.from('testuser:').toString('base64')
        });
    });

    it('Should correctly construct headers for Basic auth + any custom headers', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        'X-Test': 'test'
                    }
                }
            },
            token: {
                username: 'testuser',
                password: 'testpassword'
            }
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            Authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64'),
            'X-Test': 'test'
        });
    });

    it('Should correctly construct headers with an Authorization override', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC'
            },
            token: {
                username: 'testuser',
                password: 'testpassword'
            },
            headers: {
                Authorization: 'Bearer testtoken'
            }
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            Authorization: 'Bearer testtoken'
        });
    });

    it('Should correctly construct headers for default auth', () => {
        const config = getDefaultProxy({
            provider: {
                // @ts-expect-error expected error
                auth_mode: 'SomeOtherMode'
            },
            token: 'testtoken'
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            Authorization: 'Bearer testtoken'
        });
    });

    it('Should correctly insert headers with dynamic values for oauth', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '',
                    headers: {
                        'X-Access-Token': '${accessToken}'
                    }
                }
            },
            token: 'some-oauth-access-token'
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            Authorization: 'Bearer some-oauth-access-token',
            'X-Access-Token': 'some-oauth-access-token'
        });
    });

    it('Should correctly merge provided headers', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: '',
                    headers: {
                        'My-Token': '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'some-abc-token' },
            headers: {
                'x-custom-header': 'custom value',
                'y-custom-header': 'custom values'
            }
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            'My-Token': 'some-abc-token',
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values'
        });
    });

    it('Should construct headers for an api key', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: '',
                    headers: {
                        'X-Api-Key': '${apiKey}',
                        'X-Api-Password': '${connectionConfig.API_PASSWORD}'
                    }
                }
            },
            token: { apiKey: 'api-key-value' },
            connection: {
                connection_config: {
                    API_PASSWORD: 'api-password-value'
                }
            }
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            'X-Api-Key': 'api-key-value',
            'X-Api-Password': 'api-password-value'
        });
    });
});

describe('Proxy service Construct URL Tests', () => {
    it('should correctly construct url with no trailing slash and no leading slash', () => {
        const config = getDefaultProxy({
            provider: {
                proxy: {
                    base_url: 'https://example.com'
                }
            },
            endpoint: 'api/test'
        });

        const result = proxyService.constructUrl(config);

        expect(result).toBe('https://example.com/api/test');
    });

    it('should correctly construct url with trailing slash in base and leading slash in endpoint', () => {
        const config = getDefaultProxy({
            provider: {
                proxy: {
                    base_url: 'https://example.com/'
                }
            }
        });

        const result = proxyService.constructUrl(config);

        expect(result).toBe('https://example.com/api/test');
    });

    it('should correctly construct url with baseUrlOverride', () => {
        const config = getDefaultProxy({
            provider: {
                proxy: {
                    base_url: 'https://example.com/'
                }
            },
            endpoint: '/api/test',
            baseUrlOverride: 'https://override.com'
        });

        const result = proxyService.constructUrl(config);

        // Assuming interpolateIfNeeded doesn't change the input
        expect(result).toBe('https://override.com/api/test');
    });

    it('should correctly construct url with baseUrlOverride with no leading slash', () => {
        const config = getDefaultProxy({
            provider: {
                proxy: {
                    base_url: 'https://example.com/'
                }
            },
            baseUrlOverride: 'https://override.com'
        });

        const result = proxyService.constructUrl(config);

        // Assuming interpolateIfNeeded doesn't change the input
        expect(result).toBe('https://override.com/api/test');
    });

    it('should correctly insert a query param if the auth_mode is API_KEY and the template has a proxy.query.api_key property', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: 'https://example.com/',
                    query: {
                        api_key: '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            baseUrlOverride: 'https://override.com'
        });

        const result = proxyService.constructUrl(config);

        // Assuming interpolateIfNeeded doesn't change the input
        expect(result).toBe('https://override.com/api/test?api_key=sweet-secret-token');
    });

    it('should correctly insert a query param if the auth_mode is API_KEY and the template has a proxy.query.key property', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: 'https://example.com/',
                    query: {
                        // @ts-expect-error not sure why
                        key: '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            baseUrlOverride: 'https://override.com'
        });

        const result = proxyService.constructUrl(config);

        expect(result).toBe('https://override.com/api/test?key=sweet-secret-token');
    });

    it('should correctly insert a query param if the auth_mode is API_KEY and the template has a proxy.query.api_key property with existing query params', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: 'https://example.com/',
                    query: {
                        api_key: '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            endpoint: '/api/test?foo=bar',
            baseUrlOverride: 'https://override.com'
        });

        const result = proxyService.constructUrl(config);

        expect(result).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');
    });

    it('Should insert a proxy query and a headers', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: 'https://example.com/',
                    query: {
                        api_key: '${apiKey}'
                    },
                    headers: {
                        'x-custom-header': 'custom value',
                        'y-custom-header': 'custom values',
                        'My-Token': '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            endpoint: '/api/test?foo=bar',
            baseUrlOverride: 'https://override.com'
        });
        const url = proxyService.constructUrl(config);

        expect(url).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');

        const headers = proxyService.constructHeaders(config, 'GET', 'https://override.com/api/test?foo=bar&api_key=sweet-secret-token');

        expect(headers).toEqual({
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values',
            'My-Token': 'sweet-secret-token'
        });
    });

    it('Should handle Proxy base URL interpolation with connection configuration param', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: 'https://www.zohoapis.${connectionConfig.extension}'
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            connection: {
                connection_config: { extension: 'eu' }
            }
        });

        const url = proxyService.constructUrl(config);

        expect(url).toBe('https://www.zohoapis.eu/api/test');
    });

    it('Should handle Proxy base URL interpolation with connection metadata param', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${metadata.instance_url}'
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            connection: {
                metadata: { instance_url: 'https://myinstanceurl.com' }
            }
        });

        const url = proxyService.constructUrl(config);

        expect(url).toBe('https://myinstanceurl.com/api/test');
    });

    it('Should handle Proxy base URL interpolation where connection configuration param is present', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${connectionConfig.api_base_url_for_customer} || https://api.gong.io'
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            connection: {
                connection_config: { api_base_url_for_customer: 'https://company-17.api.gong.io' }
            }
        });

        const url = proxyService.constructUrl(config);

        expect(url).toBe('https://company-17.api.gong.io/api/test');
    });

    it('Should handle Proxy base URL interpolation where connection configuration param is absent', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${connectionConfig.api_base_url_for_customer}||https://api.gong.io'
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            connection: {}
        });

        const url = proxyService.constructUrl(config);

        expect(url).toBe('https://api.gong.io/api/test');
    });

    it('Should retry after', async () => {
        const mockAxiosError = {
            response: {
                status: 429,
                headers: {
                    'x-rateLimit-reset-after': '1'
                },
                data: {},
                statusText: 'Too Many Requests',
                config: {} as InternalAxiosRequestConfig
            } as AxiosResponse
        } as AxiosError;
        const before = Date.now();
        await proxyService.retryHandler(mockAxiosError, 'after', 'x-rateLimit-reset-after');
        const after = Date.now();
        const diff = after - before;
        expect(diff).toBeGreaterThanOrEqual(1000);
        expect(diff).toBeLessThan(2000);
    });

    it('Should retry at', async () => {
        const nowInSecs = Date.now() / 1000;
        const mockAxiosError = {
            response: {
                status: 429,
                headers: {
                    'x-rateLimit-reset': nowInSecs + 1
                },
                data: {},
                statusText: 'Too Many Requests',
                config: {} as InternalAxiosRequestConfig
            } as AxiosResponse
        } as AxiosError;
        const before = Date.now();
        await proxyService.retryHandler(mockAxiosError, 'at', 'x-rateLimit-reset');
        const after = Date.now();
        const diff = after - before;
        expect(diff).toBeGreaterThan(1000);
        expect(diff).toBeLessThan(2000);
    });
});

describe('Proxy service provider specific retries', () => {
    const nowInSecs = Date.now() / 1000;
    const mockAxiosError = {
        response: {
            status: 400,
            code: 400,
            headers: {
                'x-ratelimit-requests-reset': nowInSecs + 1,
                'x-ratelimit-requests-remaining': '0'
            },
            data: {},
            statusText: 'Bad Request',
            config: {} as InternalAxiosRequestConfig
        } as AxiosResponse
    } as AxiosError;

    it('Should retry based on the header even if the error code is not a 429', async () => {
        const nowInSecs = Date.now() / 1000;
        mockAxiosError.response = {
            ...mockAxiosError.response,
            headers: {
                'x-ratelimit-requests-reset': nowInSecs + 1,
                'x-ratelimit-requests-remaining': '0'
            }
        } as AxiosResponse;
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: 'http://example.com',
                    retry: {
                        at: 'x-ratelimit-requests-reset',
                        remaining: 'x-ratelimit-requests-remaining',
                        error_code: 400
                    }
                }
            },
            token: 'some-oauth-access-token'
        });
        const before = Date.now();
        const willRetry = await proxyService.retry(config, [], mockAxiosError, 0);
        const after = Date.now();
        const diff = after - before;
        expect(diff).toBeGreaterThan(1000);
        expect(diff).toBeLessThan(2000);
        expect(willRetry).toBe(true);
    });

    it('Should not retry based on the error_code if it does not match', async () => {
        mockAxiosError.response = {
            ...mockAxiosError.response,
            status: 437
        } as AxiosResponse;
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: 'http://example.com',
                    retry: {
                        at: 'x-ratelimit-requests-resets',
                        remaining: 'x-ratelimit-requests-remaining',
                        error_code: 400
                    }
                }
            },
            token: 'some-oauth-access-token'
        });
        const willRetry = await proxyService.retry(config, [], mockAxiosError, 0);
        expect(willRetry).toBe(false);
    });

    it('Should not retry based on the error_code if the remaining is not 0', async () => {
        const nowInSecs = Date.now() / 1000;
        mockAxiosError.response = {
            ...mockAxiosError.response,
            headers: {
                'x-ratelimit-requests-reset': nowInSecs + 1,
                'x-ratelimit-requests-remaining': '1'
            }
        } as AxiosResponse;
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: 'http://example.com',
                    retry: {
                        at: 'some-random-header',
                        remaining: 'x-ratelimit-requests-remaining',
                        error_code: 400
                    }
                }
            },
            token: 'some-oauth-access-token'
        });
        const willRetry = await proxyService.retry(config, [], mockAxiosError, 0);
        expect(willRetry).toBe(false);
    });

    it('Should not retry based on the error_code if the remaining header does not match', async () => {
        mockAxiosError.response = {
            ...mockAxiosError.response,
            status: 400
        } as AxiosResponse;
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: 'http://example.com',
                    retry: {
                        at: 'some-random-header',
                        remaining: 'not-the-same',
                        error_code: 400
                    }
                }
            },
            token: 'some-oauth-access-token'
        });
        const willRetry = await proxyService.retry(config, [], mockAxiosError, 0);
        expect(willRetry).toBe(false);
    });
});

describe('Proxy service configure', () => {
    it('Should fail if no endpoint', () => {
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: 'provider-config-key-1',
            connectionId: 'connection-1',
            endpoint: ''
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'provider-1',
            connection: {
                connection_id: 'connection-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: '1'
        };
        const { success, error, response, logs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(false);
        expect(response).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toContain('missing_endpoint');
        expect(logs.length).toBe(1);
        expect(logs[0]).toStrictEqual<MessageRowInsert>({
            type: 'log',
            level: 'error',
            createdAt: expect.any(String),
            message: 'Proxy: a API URL endpoint is missing.'
        });
    });

    it('Should fail if no connectionId', () => {
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: 'provider-config-key-1',
            connectionId: '',
            endpoint: 'https://example.com'
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'provider-1',
            connection: {
                connection_id: 'connection-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: '1'
        };
        const { success, error, response, logs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(false);
        expect(response).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toContain("Missing param 'connection_id'.");
        expect(logs.length).toBe(1);
        expect(logs[0]).toStrictEqual<MessageRowInsert>({
            type: 'log',
            level: 'error',
            createdAt: expect.any(String),
            message:
                "The connection id value is missing. If you're making a HTTP request then it should be included in the header 'Connection-Id'. If you're using the SDK the connectionId property should be specified."
        });
    });

    it('Should fail if no providerConfigKey', () => {
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: '',
            connectionId: 'connection-1',
            endpoint: 'https://example.com'
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'provider-1',
            connection: {
                connection_id: 'connection-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: '1'
        };
        const { success, error, response, logs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(false);
        expect(response).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toContain('missing_provider_config_key');
        expect(logs.length).toBe(1);
        expect(logs[0]).toStrictEqual<MessageRowInsert>({
            type: 'log',
            level: 'error',
            createdAt: expect.any(String),
            message:
                "The provider config key value is missing. If you're making a HTTP request then it should be included in the header 'Provider-Config-Key'. If you're using the SDK the providerConfigKey property should be specified."
        });
    });

    it('Should fail if unknown provider', () => {
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: 'provider-config-key-1',
            connectionId: 'connection-1',
            endpoint: 'https://example.com'
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'unknown',
            connection: {
                connection_id: 'connection-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: '1'
        };
        const { success, error, response, logs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(false);
        expect(response).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toContain("No Provider Template matching the 'provider' parameter.");
        expect(logs.length).toBe(1);
        expect(logs[0]).toStrictEqual<MessageRowInsert>({
            type: 'log',
            level: 'error',
            createdAt: expect.any(String),
            message: 'Provider unknown does not exist'
        });
    });

    it('Should succeed', () => {
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: 'provider-config-key-1',
            connectionId: 'connection-1',
            endpoint: '/api/test',
            retries: 3,
            baseUrlOverride: 'https://api.github.com.override',
            headers: {
                'x-custom': 'custom-value'
            },
            params: { foo: 'bar' },
            responseType: 'blob'
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'github',
            connection: {
                connection_id: 'connection-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: '1'
        };
        const { success, error, response, logs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(true);
        expect(response).toMatchObject({
            endpoint: '/api/test',
            method: 'GET',
            provider: {
                auth_mode: 'OAUTH2',
                authorization_url: 'https://github.com/login/oauth/authorize',
                token_url: 'https://github.com/login/oauth/access_token',
                proxy: {
                    base_url: 'https://api.github.com'
                },
                docs: 'https://docs.nango.dev/integrations/all/github'
            },
            token: '',
            providerName: 'github',
            providerConfigKey: 'provider-config-key-1',
            connectionId: 'connection-1',
            headers: {
                'x-custom': 'custom-value'
            },
            retries: 3,
            baseUrlOverride: 'https://api.github.com.override',
            decompress: false,
            connection: {
                connection_id: 'connection-1',
                credentials: {},
                connection_config: {}
            },
            params: { foo: 'bar' },
            responseType: 'blob'
        });
        expect(error).toBeNull();
        expect(logs.length).toBe(0);
    });

    it('Should correctly insert headers with dynamic values for signature based', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'SIGNATURE',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        'X-WSSE': '${accessToken}'
                    }
                }
            },
            token: 'some-oauth-access-token'
        });

        const result = proxyService.constructHeaders(config, 'GET', 'https://api.nangostarter.com');

        expect(result).toEqual({
            Authorization: 'Bearer some-oauth-access-token',
            'X-WSSE': 'some-oauth-access-token'
        });
    });

    it('should correctly override headers with different casing', () => {
        const config: UserProvidedProxyConfiguration = {
            connectionId: 'a',
            endpoint: '/top',
            method: 'GET',
            providerConfigKey: 'foobar',
            headers: {
                // Authorization can be override by Workable proxy header
                Authorization: 'my custom auth',
                foo: 'Bar' // should not change value casing
            }
        };

        const internalConfig: InternalProxyConfiguration = {
            providerName: 'workable',
            connection: getDefaultConnection()
        };

        const result = proxyService.configure(config, internalConfig);
        expect(result.response?.headers).toStrictEqual({
            authorization: 'my custom auth',
            foo: 'Bar'
        });

        const merge = proxyService.constructHeaders(result.response!, result.response!.method, 'http://example.com');
        expect(merge).toStrictEqual({
            authorization: 'my custom auth',
            foo: 'Bar'
        });
    });
});
