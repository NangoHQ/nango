import { expect, describe, it } from 'vitest';
import { buildProxyHeaders, buildProxyURL, getProxyConfiguration, ProxyError } from './utils.js';
import type { UserProvidedProxyConfiguration, InternalProxyConfiguration, OAuth2Credentials } from '@nangohq/types';

import { getDefaultConnection, getDefaultProxy } from './utils.test.js';

describe('buildProxyHeaders', () => {
    it('should correctly construct a header using an api key with multiple headers', () => {
        const config = getDefaultProxy({
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
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

        const headers = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(headers).toEqual({
            'My-Token': 'sweet-secret-token',
            'X-Test': 'test'
        });
    });

    it('should correctly construct headers for Basic auth', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC'
            },
            token: { type: 'BASIC', username: 'testuser', password: 'testpassword' }
        });

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64')
        });
    });

    it('should correctly construct headers for Basic auth with no password', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC'
            },
            token: { type: 'BASIC', username: 'testuser', password: '' }
        });

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            authorization: 'Basic ' + Buffer.from('testuser:').toString('base64')
        });
    });

    it('should correctly construct headers for Basic auth + any custom headers', () => {
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
            token: { type: 'BASIC', username: 'testuser', password: 'testpassword' }
        });

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64'),
            'X-Test': 'test'
        });
    });

    it('should correctly construct headers with an authorization override', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC'
            },
            token: { type: 'BASIC', username: 'testuser', password: 'testpassword' },
            headers: {
                authorization: 'Bearer testtoken'
            }
        });

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            authorization: 'Bearer testtoken'
        });
    });

    it('should correctly construct headers for default auth', () => {
        const config = getDefaultProxy({
            provider: {
                // @ts-expect-error expected error
                auth_mode: 'SomeOtherMode'
            },
            token: 'testtoken'
        });

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            authorization: 'Bearer testtoken'
        });
    });

    it('should correctly insert headers with dynamic values for oauth', () => {
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

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            authorization: 'Bearer some-oauth-access-token',
            'X-Access-Token': 'some-oauth-access-token'
        });
    });

    it('should correctly merge provided headers', () => {
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
            token: { type: 'API_KEY', apiKey: 'some-abc-token' },
            headers: {
                'x-custom-header': 'custom value',
                'y-custom-header': 'custom values'
            }
        });

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            'My-Token': 'some-abc-token',
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values'
        });
    });

    it('should construct headers for an api key', () => {
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
            token: { type: 'API_KEY', apiKey: 'api-key-value' },
            connection: {
                connection_config: {
                    API_PASSWORD: 'api-password-value'
                }
            }
        });

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            'X-Api-Key': 'api-key-value',
            'X-Api-Password': 'api-password-value'
        });
    });

    it('should correctly insert headers with dynamic values for signature based', () => {
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

        const result = buildProxyHeaders(config, 'https://api.nangostarter.com');

        expect(result).toEqual({
            authorization: 'Bearer some-oauth-access-token',
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
                // authorization can be override by Workable proxy header
                authorization: 'my custom auth',
                foo: 'Bar' // should not change value casing
            }
        };

        const internalConfig: InternalProxyConfiguration = {
            providerName: 'workable',
            connection: getDefaultConnection()
        };

        const result = getProxyConfiguration({ externalConfig: config, internalConfig });
        const val = result.unwrap();
        expect(val.headers).toStrictEqual({
            authorization: 'my custom auth',
            foo: 'Bar'
        });

        const merge = buildProxyHeaders(val, 'http://example.com');
        expect(merge).toStrictEqual({
            authorization: 'my custom auth',
            foo: 'Bar'
        });
    });
});

describe('buildProxyURL', () => {
    it('should correctly construct url with no trailing slash and no leading slash', () => {
        const config = getDefaultProxy({
            provider: {
                proxy: {
                    base_url: 'https://example.com'
                }
            },
            endpoint: 'api/test'
        });

        const result = buildProxyURL(config);

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

        const result = buildProxyURL(config);

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

        const result = buildProxyURL(config);

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

        const result = buildProxyURL(config);

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
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
            baseUrlOverride: 'https://override.com'
        });

        const result = buildProxyURL(config);

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
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
            baseUrlOverride: 'https://override.com'
        });

        const result = buildProxyURL(config);

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
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
            endpoint: '/api/test?foo=bar',
            baseUrlOverride: 'https://override.com'
        });

        const result = buildProxyURL(config);

        expect(result).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');
    });

    it('should insert a proxy query and a headers', () => {
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
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
            endpoint: '/api/test?foo=bar',
            baseUrlOverride: 'https://override.com'
        });
        const url = buildProxyURL(config);

        expect(url).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');

        const headers = buildProxyHeaders(config, 'https://override.com/api/test?foo=bar&api_key=sweet-secret-token');

        expect(headers).toEqual({
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values',
            'My-Token': 'sweet-secret-token'
        });
    });

    it('should handle Proxy base URL interpolation with connection configuration param', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: 'https://www.zohoapis.${connectionConfig.extension}'
                }
            },
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
            connection: {
                connection_config: { extension: 'eu' }
            }
        });

        const url = buildProxyURL(config);

        expect(url).toBe('https://www.zohoapis.eu/api/test');
    });

    it('should handle Proxy base URL interpolation with connection metadata param', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${metadata.instance_url}'
                }
            },
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
            connection: {
                metadata: { instance_url: 'https://myinstanceurl.com' }
            }
        });

        const url = buildProxyURL(config);

        expect(url).toBe('https://myinstanceurl.com/api/test');
    });

    it('should handle Proxy base URL interpolation where connection configuration param is present', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${connectionConfig.api_base_url_for_customer} || https://api.gong.io'
                }
            },
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
            connection: {
                connection_config: { api_base_url_for_customer: 'https://company-17.api.gong.io' }
            }
        });

        const url = buildProxyURL(config);

        expect(url).toBe('https://company-17.api.gong.io/api/test');
    });

    it('should handle Proxy base URL interpolation where connection configuration param is absent', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${connectionConfig.api_base_url_for_customer}||https://api.gong.io'
                }
            },
            token: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
            connection: {}
        });

        const url = buildProxyURL(config);

        expect(url).toBe('https://api.gong.io/api/test');
    });

    it('should construct url with a string query params with ?', () => {
        const url = buildProxyURL(
            getDefaultProxy({
                provider: {
                    auth_mode: 'OAUTH2',
                    proxy: {
                        base_url: 'https://example.com'
                    }
                },
                params: '?foo=bar'
            })
        );

        expect(url).toBe('https://example.com/api/test?foo=bar');
    });

    it('should construct url with a string query params without ?', () => {
        const url = buildProxyURL(
            getDefaultProxy({
                provider: {
                    auth_mode: 'OAUTH2',
                    proxy: {
                        base_url: 'https://example.com'
                    }
                },
                params: 'foo=bar'
            })
        );

        expect(url).toBe('https://example.com/api/test?foo=bar');
    });

    it('should throw when setting query params in both endpoint and params', () => {
        expect(() => {
            buildProxyURL(
                getDefaultProxy({
                    provider: {
                        auth_mode: 'OAUTH2',
                        proxy: {
                            base_url: 'https://example.com'
                        }
                    },
                    endpoint: 'https://example.com?bar=foo',
                    params: '?foo=bar'
                })
            );
        }).toThrow(new Error('Can not set query params in endpoint and in params'));
    });
});

describe('getProxyConfiguration', () => {
    it('should fail if no endpoint', () => {
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
                connection_config: {},
                metadata: null
            },
            existingActivityLogId: '1'
        };

        const res = getProxyConfiguration({ externalConfig, internalConfig });
        if (res.isOk()) {
            expect(res.value).toBe(Error);
            return;
        }

        const err = res.error;
        expect(err).toStrictEqual(new ProxyError('missing_api_url'));
    });

    it('should fail if no connectionId', () => {
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
                connection_config: {},
                metadata: null
            },
            existingActivityLogId: '1'
        };

        const res = getProxyConfiguration({ externalConfig, internalConfig });
        if (res.isOk()) {
            expect(res.value).toBe(Error);
            return;
        }

        const err = res.error;
        expect(err).toStrictEqual(new ProxyError('missing_connection_id'));
    });

    it('should fail if no providerConfigKey', () => {
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
                connection_config: {},
                metadata: null
            },
            existingActivityLogId: '1'
        };

        const res = getProxyConfiguration({ externalConfig, internalConfig });
        if (res.isOk()) {
            expect(res.value).toBe(Error);
            return;
        }

        const err = res.error;
        expect(err).toStrictEqual(new ProxyError('missing_provider'));
    });

    it('should fail if unknown provider', () => {
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
                connection_config: {},
                metadata: null
            },
            existingActivityLogId: '1'
        };

        const res = getProxyConfiguration({ externalConfig, internalConfig });
        if (res.isOk()) {
            expect(res.value).toBe(Error);
            return;
        }

        const err = res.error;
        expect(err).toStrictEqual(new ProxyError('unknown_provider'));
    });

    it('should succeed', () => {
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
                connection_config: {},
                metadata: null
            },
            existingActivityLogId: '1'
        };

        const res = getProxyConfiguration({ externalConfig, internalConfig });
        if (res.isErr()) {
            throw res.error;
        }

        const val = res.value;
        expect(val).toMatchObject({
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
    });

    it('Should not include Authorization header when includeAuthentication is false', () => {
        const config: ApplicationConstructedProxyConfiguration = {
            provider: { auth_mode: 'OAUTH2' },
            token: 'test-token',
            includeAuthentication: false
        } as ApplicationConstructedProxyConfiguration;

        const headers = proxyService.constructHeaders(config, 'GET', 'https://api.example.com');

        expect(headers).not.toHaveProperty('Authorization');
    });

    it('Should include Authorization header when includeAuthentication is not present', () => {
        const config: ApplicationConstructedProxyConfiguration = {
            provider: { auth_mode: 'OAUTH2' },
            token: 'test-token'
        } as ApplicationConstructedProxyConfiguration;

        const headers = proxyService.constructHeaders(config, 'GET', 'https://api.example.com');

        expect(headers).toHaveProperty('Authorization', 'Bearer test-token');
    });

    it('Should include Authorization header when includeAuthentication is true', () => {
        const config: ApplicationConstructedProxyConfiguration = {
            provider: { auth_mode: 'OAUTH2' },
            token: 'test-token',
            includeAuthentication: true
        } as ApplicationConstructedProxyConfiguration;

        const headers = proxyService.constructHeaders(config, 'GET', 'https://api.example.com');

        expect(headers).toHaveProperty('Authorization', 'Bearer test-token');
    });
});
