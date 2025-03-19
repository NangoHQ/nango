import { expect, describe, it } from 'vitest';
import { buildProxyHeaders, buildProxyURL, getProxyConfiguration, ProxyError } from './utils.js';
import type { UserProvidedProxyConfiguration, InternalProxyConfiguration } from '@nangohq/types';

import { getDefaultProxy } from './utils.test.js';
import { getTestConnection } from '../connections/utils.test.js';

describe('buildProxyHeaders', () => {
    it('should correctly construct a header using an api key with multiple headers', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                authorization_url: 'https://api.nangostarter.com',
                token_url: 'https://api.nangostarter.com',
                proxy: {
                    base_url: 'https://api.nangostarter.com',
                    headers: {
                        'my-token': '${apiKey}',
                        'x-test': 'test'
                    }
                }
            }
        });

        const headers = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
                connection_config: {
                    instance_url: 'bar'
                }
            })
        });

        expect(headers).toEqual({
            'my-token': 'sweet-secret-token',
            'x-test': 'test'
        });
    });

    it('should correctly construct headers for Basic auth', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC',
                proxy: { base_url: '' }
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'BASIC', username: 'testuser', password: 'testpassword' }
            })
        });

        expect(result).toEqual({
            authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64')
        });
    });

    it('should correctly construct headers for Basic auth with no password', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC',
                proxy: { base_url: '' }
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'BASIC', username: 'testuser', password: '' }
            })
        });

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
                        'x-test': 'test'
                    }
                }
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'BASIC', username: 'testuser', password: 'testpassword' }
            })
        });

        expect(result).toEqual({
            authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64'),
            'x-test': 'test'
        });
    });

    it('should correctly construct headers with an authorization override', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC'
            },
            headers: {
                authorization: 'Bearer testtoken'
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'BASIC', username: 'testuser', password: 'testpassword' }
            })
        });

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
                        'x-access-token': '${accessToken}'
                    }
                }
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'OAUTH2', access_token: 'some-oauth-access-token', raw: {} }
            })
        });

        expect(result).toEqual({
            authorization: 'Bearer some-oauth-access-token',
            'x-access-token': 'some-oauth-access-token'
        });
    });

    it('should correctly merge provided headers', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: '',
                    headers: {
                        'my-token': '${apiKey}'
                    }
                }
            },
            headers: {
                'x-custom-header': 'custom value',
                'y-custom-header': 'custom values'
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'some-abc-token' }
            })
        });

        expect(result).toEqual({
            'my-token': 'some-abc-token',
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
                        'x-api-key': '${apiKey}',
                        'x-api-password': '${connectionConfig.API_PASSWORD}'
                    }
                }
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'api-key-value' },
                connection_config: {
                    API_PASSWORD: 'api-password-value'
                }
            })
        });

        expect(result).toEqual({
            'x-api-key': 'api-key-value',
            'x-api-password': 'api-password-value'
        });
    });

    it('should correctly insert headers with dynamic values for signature based', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'SIGNATURE',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        'x-wsse': '${accessToken}'
                    }
                }
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: { type: 'SIGNATURE', username: 't', password: 'some-oauth-access-token', token: 'some-oauth-access-token' }
            })
        });

        expect(result).toEqual({
            authorization: 'Bearer some-oauth-access-token',
            'x-wsse': 'some-oauth-access-token'
        });
    });

    it('should correctly insert headers with dynamic values for two_step based', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'TWO_STEP',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        'authorization-token': '${accessToken}'
                    }
                }
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: {
                    type: 'TWO_STEP',
                    username: 't',
                    password: 'some-oauth-access-token',
                    org: 'example',
                    token: 'some-oauth-access-token',
                    raw: { AccessToken: '3432432434324234', RestApiUrl: 'https://example.com' }
                }
            })
        });

        expect(result).toEqual({
            authorization: 'Bearer some-oauth-access-token',
            'authorization-token': 'some-oauth-access-token'
        });
    });

    it('should correctly override headers with different casing', () => {
        const config: UserProvidedProxyConfiguration = {
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
            providerName: 'workable'
        };

        const result = getProxyConfiguration({ externalConfig: config, internalConfig });
        const val = result.unwrap();
        expect(val.headers).toStrictEqual({
            authorization: 'my custom auth',
            foo: 'Bar'
        });

        const merge = buildProxyHeaders({ config: val, url: 'http://example.com', connection: getTestConnection() });
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

        const result = buildProxyURL({ config, connection: getTestConnection() });

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

        const result = buildProxyURL({ config, connection: getTestConnection() });

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

        const result = buildProxyURL({ config, connection: getTestConnection() });

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

        const result = buildProxyURL({ config, connection: getTestConnection() });

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
            baseUrlOverride: 'https://override.com'
        });

        const result = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' }
            })
        });

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
            baseUrlOverride: 'https://override.com'
        });

        const result = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' }
            })
        });

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
            endpoint: '/api/test?foo=bar',
            baseUrlOverride: 'https://override.com'
        });

        const result = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' }
            })
        });

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
                        'my-token': '${apiKey}'
                    }
                }
            },
            endpoint: '/api/test?foo=bar',
            baseUrlOverride: 'https://override.com'
        });
        const connection = getTestConnection({
            credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' }
        });
        const url = buildProxyURL({ config, connection });

        expect(url).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');

        const headers = buildProxyHeaders({ config, connection, url: 'https://override.com/api/test?foo=bar&api_key=sweet-secret-token' });

        expect(headers).toEqual({
            'x-custom-header': 'custom value',
            'y-custom-header': 'custom values',
            'my-token': 'sweet-secret-token'
        });
    });

    it('should handle Proxy base URL interpolation with connection configuration param', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: 'https://www.zohoapis.${connectionConfig.extension}'
                }
            }
        });

        const url = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
                connection_config: { extension: 'eu' }
            })
        });

        expect(url).toBe('https://www.zohoapis.eu/api/test');
    });

    it('should handle Proxy base URL interpolation with connection metadata param', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${metadata.instance_url}'
                }
            }
        });

        const url = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
                metadata: { instance_url: 'https://myinstanceurl.com' }
            })
        });

        expect(url).toBe('https://myinstanceurl.com/api/test');
    });

    it('should handle Proxy base URL interpolation where connection configuration param is present', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${connectionConfig.api_base_url_for_customer} || https://api.gong.io'
                }
            }
        });

        const url = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' },
                connection_config: { api_base_url_for_customer: 'https://company-17.api.gong.io' }
            })
        });

        expect(url).toBe('https://company-17.api.gong.io/api/test');
    });

    it('should handle Proxy base URL interpolation where connection configuration param is absent', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: {
                    base_url: '${connectionConfig.api_base_url_for_customer}||https://api.gong.io'
                }
            }
        });

        const url = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'sweet-secret-token' }
            })
        });

        expect(url).toBe('https://api.gong.io/api/test');
    });

    it('should construct url with a string query params with ?', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'OAUTH2',
                    proxy: {
                        base_url: 'https://example.com'
                    }
                },
                params: '?foo=bar'
            }),
            connection: getTestConnection()
        });

        expect(url).toBe('https://example.com/api/test?foo=bar');
    });

    it('should construct url with a string query params without ?', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'OAUTH2',
                    proxy: {
                        base_url: 'https://example.com'
                    }
                },
                params: 'foo=bar'
            }),
            connection: getTestConnection()
        });

        expect(url).toBe('https://example.com/api/test?foo=bar');
    });

    it('should throw when setting query params in both endpoint and params', () => {
        expect(() => {
            buildProxyURL({
                config: getDefaultProxy({
                    provider: {
                        auth_mode: 'OAUTH2',
                        proxy: {
                            base_url: 'https://example.com'
                        }
                    },
                    endpoint: 'https://example.com?bar=foo',
                    params: '?foo=bar'
                }),
                connection: getTestConnection()
            });
        }).toThrow(new Error('Can not set query params in endpoint and in params'));
    });

    it('should handle array', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'OAUTH2',
                    proxy: {
                        base_url: 'https://example.com'
                    }
                },
                params: { ids: [1, 2] }
            }),
            connection: getTestConnection()
        });

        expect(url).toBe('https://example.com/api/test?ids=1%2C2');
    });
});

describe('getProxyConfiguration', () => {
    it('should fail if no endpoint', () => {
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: 'provider-config-key-1',
            endpoint: ''
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'provider-1'
        };

        const res = getProxyConfiguration({ externalConfig, internalConfig });
        if (res.isOk()) {
            expect(res.value).toBe(Error);
            return;
        }

        const err = res.error;
        expect(err).toStrictEqual(new ProxyError('missing_api_url'));
    });

    it('should fail if no providerConfigKey', () => {
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: '',
            endpoint: 'https://example.com'
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'provider-1'
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
            endpoint: 'https://example.com'
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'unknown'
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
            providerName: 'github'
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
            providerName: 'github',
            providerConfigKey: 'provider-config-key-1',
            headers: {
                'x-custom': 'custom-value'
            },
            retries: 3,
            baseUrlOverride: 'https://api.github.com.override',
            decompress: false,
            params: { foo: 'bar' },
            responseType: 'blob'
        });
    });
});
