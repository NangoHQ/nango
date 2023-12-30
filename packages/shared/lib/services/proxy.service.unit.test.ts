import { expect, describe, it } from 'vitest';
import proxyService from './proxy.service.js';
import { HTTP_VERB, AuthModes } from '../models/index.js';
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

describe('Proxy Controller Construct Header Tests', () => {
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

        // @ts-ignore
        const headers = proxyService.constructHeaders(config);

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

        // @ts-ignore
        const result = proxyService.constructHeaders(config);

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

        // @ts-ignore
        const result = proxyService.constructHeaders(config);

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

        // @ts-ignore
        const result = proxyService.constructHeaders(config);

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

        // @ts-ignore
        const result = proxyService.constructHeaders(config);

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

        // @ts-ignore
        const result = proxyService.constructHeaders(config);

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

        // @ts-ignore
        const result = proxyService.constructHeaders(config);

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

        // @ts-ignore
        const result = proxyService.constructHeaders(config);

        expect(result).toEqual({
            'My-Token': 'some-abc-token',
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values'
        });
    });
});

describe('Proxy Controller Construct URL Tests', () => {
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

        // @ts-ignore
        const result = proxyService.constructUrl(config);

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

        // @ts-ignore
        const result = proxyService.constructUrl(config);

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

        // @ts-ignore
        const result = proxyService.constructUrl(config);

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

        // @ts-ignore
        const result = proxyService.constructUrl(config);

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

        // @ts-ignore
        const result = proxyService.constructUrl(config);

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

        // @ts-ignore
        const result = proxyService.constructUrl(config);

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

        // @ts-ignore
        const result = proxyService.constructUrl(config);

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
        // @ts-ignore
        const url = proxyService.constructUrl(config);

        expect(url).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');

        // @ts-ignore
        const headers = proxyService.constructHeaders(config);

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

        // @ts-ignore
        const url = proxyService.constructUrl(config);

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

        // @ts-ignore
        const url = proxyService.constructUrl(config);

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

        // @ts-ignore
        const strippedHeaders = proxyService.stripSensitiveHeaders(headers, config);

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

        // @ts-ignore
        const strippedHeaders = proxyService.stripSensitiveHeaders(headers, config);

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
        expect(diff).toBeGreaterThan(1000);
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
