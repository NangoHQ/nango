import { expect, describe, it } from 'vitest';
import proxyService from './proxy.service.js';
import { HTTP_VERB, AuthModes, UserProvidedProxyConfiguration, InternalProxyConfiguration, OAuth2Credentials } from '../models/index.js';
import type { ApplicationConstructedProxyConfiguration } from '../models/Proxy.js';
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('Proxy service Construct Header Tests', () => {
    it('Should correctly construct a header using an api key with multiple headers', () => {
        const config = {
            endpoint: 'https://api.nangostarter.com',
            provider: 'test',
            providerConfigKey: 'test',
            connectionId: 'test',
            token: { apiKey: 'sweet-secret-token' },
            method: 'GET' as HTTP_VERB,
            template: {
                auth_mode: AuthModes.ApiKey,
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
                conectionConfig: {
                    insance_url: 'bar'
                }
            }
        };

        const headers = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(headers).toEqual({
            'My-Token': 'sweet-secret-token',
            'X-Test': 'test'
        });
    });

    it('Should correctly construct headers for Basic auth', () => {
        const config = {
            template: {
                auth_mode: AuthModes.Basic
            },
            token: {
                username: 'testuser',
                password: 'testpassword'
            }
        };

        const result = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toEqual({
            Authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64')
        });
    });

    it('Should correctly construct headers for Basic auth with no password', () => {
        const config = {
            template: {
                auth_mode: AuthModes.Basic
            },
            token: {
                username: 'testuser'
            }
        };

        const result = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toEqual({
            Authorization: 'Basic ' + Buffer.from('testuser:').toString('base64')
        });
    });

    it('Should correctly construct headers for Basic auth + any custom headers', () => {
        const config = {
            template: {
                auth_mode: AuthModes.Basic,
                proxy: {
                    headers: {
                        'X-Test': 'test'
                    }
                }
            },
            token: {
                username: 'testuser',
                password: 'testpassword'
            }
        };

        const result = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toEqual({
            Authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64'),
            'X-Test': 'test'
        });
    });

    it('Should correctly construct headers with an Authorization override', () => {
        const config = {
            template: {
                auth_mode: AuthModes.Basic
            },
            token: {
                username: 'testuser',
                password: 'testpassword'
            },
            headers: {
                Authorization: 'Bearer testtoken'
            }
        };

        const result = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toEqual({
            Authorization: 'Bearer testtoken'
        });
    });

    it('Should correctly construct headers for default auth', () => {
        const config = {
            template: {
                auth_mode: 'SomeOtherMode'
            },
            token: 'testtoken'
        };

        const result = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toEqual({
            Authorization: 'Bearer testtoken'
        });
    });

    it('Should correctly insert headers with dynamic values for oauth', () => {
        const config = {
            template: {
                auth_mode: 'OAUTH2',
                proxy: {
                    headers: {
                        'X-Access-Token': '${accessToken}'
                    }
                }
            },
            token: 'some-oauth-access-token'
        };

        const result = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toEqual({
            Authorization: 'Bearer some-oauth-access-token',
            'X-Access-Token': 'some-oauth-access-token'
        });
    });

    it('Should correctly merge provided headers', () => {
        const config = {
            template: {
                auth_mode: AuthModes.ApiKey,
                proxy: {
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
        };

        const result = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toEqual({
            'My-Token': 'some-abc-token',
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values'
        });
    });

    it('Should construct headers for an api key', () => {
        const config = {
            template: {
                auth_mode: AuthModes.ApiKey,
                proxy: {
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
        };

        const result = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toEqual({
            'X-Api-Key': 'api-key-value',
            'X-Api-Password': 'api-password-value'
        });
    });
});

describe('Proxy service Construct URL Tests', () => {
    it('should correctly construct url with no trailing slash and no leading slash', () => {
        const config = {
            template: {
                proxy: {
                    base_url: 'https://example.com'
                }
            },
            endpoint: 'api/test',
            connection: {}
        };

        const result = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toBe('https://example.com/api/test');
    });

    it('should correctly construct url with trailing slash in base and leading slash in endpoint', () => {
        const config = {
            template: {
                proxy: {
                    base_url: 'https://example.com/'
                }
            },
            endpoint: '/api/test',
            connection: {}
        };

        const result = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toBe('https://example.com/api/test');
    });

    it('should correctly construct url with baseUrlOverride', () => {
        const config = {
            template: {
                proxy: {
                    base_url: 'https://example.com/'
                }
            },
            endpoint: '/api/test',
            baseUrlOverride: 'https://override.com',
            connection: {}
        };

        const result = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        // Assuming interpolateIfNeeded doesn't change the input
        expect(result).toBe('https://override.com/api/test');
    });

    it('should correctly construct url with baseUrlOverride with no leading slash', () => {
        const config = {
            template: {
                proxy: {
                    base_url: 'https://example.com/'
                }
            },
            endpoint: 'api/test',
            baseUrlOverride: 'https://override.com',
            connection: {}
        };

        const result = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        // Assuming interpolateIfNeeded doesn't change the input
        expect(result).toBe('https://override.com/api/test');
    });

    it('should correctly insert a query param if the auth_mode is API_KEY and the template has a proxy.query.api_key property', () => {
        const config = {
            template: {
                auth_mode: AuthModes.ApiKey,
                proxy: {
                    base_url: 'https://example.com/',
                    query: {
                        api_key: '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            endpoint: '/api/test',
            baseUrlOverride: 'https://override.com',
            connection: {}
        };

        const result = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        // Assuming interpolateIfNeeded doesn't change the input
        expect(result).toBe('https://override.com/api/test?api_key=sweet-secret-token');
    });

    it('should correctly insert a query param if the auth_mode is API_KEY and the template has a proxy.query.key property', () => {
        const config = {
            template: {
                auth_mode: AuthModes.ApiKey,
                proxy: {
                    base_url: 'https://example.com/',
                    query: {
                        key: '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            endpoint: '/api/test',
            baseUrlOverride: 'https://override.com',
            connection: {}
        };

        const result = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toBe('https://override.com/api/test?key=sweet-secret-token');
    });

    it('should correctly insert a query param if the auth_mode is API_KEY and the template has a proxy.query.api_key property with existing query params', () => {
        const config = {
            template: {
                auth_mode: AuthModes.ApiKey,
                proxy: {
                    base_url: 'https://example.com/',
                    query: {
                        api_key: '${apiKey}'
                    }
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            endpoint: '/api/test?foo=bar',
            baseUrlOverride: 'https://override.com',
            connection: {}
        };

        const result = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(result).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');
    });

    it('Should insert a proxy query and a headers', () => {
        const config = {
            template: {
                auth_mode: AuthModes.ApiKey,
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
            baseUrlOverride: 'https://override.com',
            connection: {}
        };
        const url = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(url).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');

        const headers = proxyService.constructHeaders(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(headers).toEqual({
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values',
            'My-Token': 'sweet-secret-token'
        });
    });

    it('Should handle Proxy base URL interpolation with connection configuration param', () => {
        const config = {
            template: {
                auth_mode: AuthModes.OAuth2,
                proxy: {
                    base_url: 'https://www.zohoapis.${connectionConfig.extension}'
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            endpoint: '/api/test',
            connection: {
                connection_config: { extension: 'eu' }
            }
        };

        const url = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(url).toBe('https://www.zohoapis.eu/api/test');
    });

    it('Should handle Proxy base URL interpolation with connection metadata param', () => {
        const config = {
            template: {
                auth_mode: AuthModes.OAuth2,
                proxy: {
                    base_url: '${metadata.instance_url}'
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            endpoint: '/api/test',
            connection: {
                metadata: { instance_url: 'https://myinstanceurl.com' }
            }
        };

        const url = proxyService.constructUrl(config as unknown as ApplicationConstructedProxyConfiguration);

        expect(url).toBe('https://myinstanceurl.com/api/test');
    });

    it('Should strip away the auth token from the headers', () => {
        const headers = {
            Accept: 'application/json',
            Authorization: 'Bearer real-token',
            'Another-Header': 'value',
            'Sensitive-Token': 'real-token'
        };

        const config = {
            token: 'real-token',
            headers: headers
        };

        const strippedHeaders = proxyService.stripSensitiveHeaders(headers, config as unknown as ApplicationConstructedProxyConfiguration);

        expect(strippedHeaders).toEqual({
            Accept: 'application/json',
            Authorization: 'Bearer xxxx',
            'Another-Header': 'value',
            'Sensitive-Token': 'xxxx'
        });
    });

    it('Should strip away an authorization header if there is no token', () => {
        const headers = {
            Accept: 'application/json',
            Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
            'Another-Header': 'value',
            'Content-Type': 'application/json'
        };

        const config = {
            headers: headers
        };

        const strippedHeaders = proxyService.stripSensitiveHeaders(headers, config as unknown as ApplicationConstructedProxyConfiguration);

        expect(strippedHeaders).toEqual({
            Accept: 'application/json',
            Authorization: 'Bearer xxxx',
            'Another-Header': 'value',
            'Content-Type': 'application/json'
        });
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
        await proxyService.retryHandler(1, 1, mockAxiosError, 'after', 'x-rateLimit-reset-after');
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
        await proxyService.retryHandler(1, 1, mockAxiosError, 'at', 'x-rateLimit-reset');
        const after = Date.now();
        const diff = after - before;
        expect(diff).toBeGreaterThan(1000);
        expect(diff).toBeLessThan(2000);
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
            provider: 'provider-1',
            connection: {
                environment_id: 1,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: 1
        };
        const { success, error, response, activityLogs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(false);
        expect(response).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toContain('missing_endpoint');
        expect(activityLogs.length).toBe(1);
        expect(activityLogs[0]).toMatchObject({
            environment_id: 1,
            activity_log_id: 1,
            level: 'error'
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
            provider: 'provider-1',
            connection: {
                environment_id: 1,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: 1
        };
        const { success, error, response, activityLogs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(false);
        expect(response).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toContain('missing_connection_id');
        expect(activityLogs.length).toBe(1);
        expect(activityLogs[0]).toMatchObject({
            environment_id: 1,
            activity_log_id: 1,
            level: 'error'
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
            provider: 'provider-1',
            connection: {
                environment_id: 1,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: 1
        };
        const { success, error, response, activityLogs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(false);
        expect(response).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toContain('missing_provider_config_key');
        expect(activityLogs.length).toBe(1);
        expect(activityLogs[0]).toMatchObject({
            environment_id: 1,
            activity_log_id: 1,
            level: 'error'
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
            provider: 'unknown',
            connection: {
                environment_id: 1,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: 1
        };
        const { success, error, response, activityLogs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(false);
        expect(response).toBeNull();
        expect(error).toBeDefined();
        expect(error?.message).toContain('proxy is not supported');
        expect(activityLogs.length).toBe(3);
        expect(activityLogs[2]).toMatchObject({
            environment_id: 1,
            activity_log_id: 1,
            level: 'error'
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
            provider: 'github',
            connection: {
                environment_id: 1,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                credentials: {} as OAuth2Credentials,
                connection_config: {}
            },
            existingActivityLogId: 1
        };
        const { success, error, response, activityLogs } = proxyService.configure(externalConfig, internalConfig);
        expect(success).toBe(true);
        expect(response).toMatchObject({
            endpoint: '/api/test',
            method: 'GET',
            template: {
                auth_mode: 'OAUTH2',
                authorization_url: 'https://github.com/login/oauth/authorize',
                token_url: 'https://github.com/login/oauth/access_token',
                proxy: {
                    base_url: 'https://api.github.com'
                },
                docs: 'https://docs.github.com/en/rest'
            },
            token: '',
            provider: 'github',
            providerConfigKey: 'provider-config-key-1',
            connectionId: 'connection-1',
            headers: {
                'x-custom': 'custom-value'
            },
            retries: 3,
            baseUrlOverride: 'https://api.github.com.override',
            decompress: false,
            connection: {
                environment_id: 1,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                credentials: {},
                connection_config: {}
            },
            params: { foo: 'bar' },
            responseType: 'blob'
        });
        expect(error).toBeNull();
        expect(activityLogs.length).toBe(4);
    });
});
