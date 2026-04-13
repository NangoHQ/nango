import { describe, expect, it } from 'vitest';

import { ProxyError, absoluteUrlFromRedirectRequestOptions, buildProxyHeaders, buildProxyURL, getAxiosConfiguration, getProxyConfiguration } from './utils.js';
import { getDefaultProxy } from './utils.test.js';
import { getTestConnection } from '../../seeders/connection.seeder.js';

import type { InternalProxyConfiguration, UserProvidedProxyConfiguration } from '@nangohq/types';

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
            'authorization-token': 'some-oauth-access-token'
        });
    });

    it('TWO_STEP: interpolates proxy.headers ${endpoint} with config.endpoint', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'TWO_STEP',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        'x-request-path': '${endpoint}'
                    }
                }
            },
            endpoint: '/v1.0/msp/tenants'
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: {
                    type: 'TWO_STEP',
                    token: 'token',
                    raw: {}
                }
            })
        });

        expect(result['x-request-path']).toBe('/v1.0/msp/tenants');
    });

    it('TWO_STEP: interpolates proxy.headers ${random} and uses same value across headers (stable per request)', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'TWO_STEP',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        'x-av-req-id': '${random}',
                        'x-av-req-id-copy': '${random}'
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
                    token: 't',
                    raw: {}
                }
            })
        });

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(result['x-av-req-id']).toMatch(uuidRegex);
        expect(result['x-av-req-id-copy']).toMatch(uuidRegex);
        expect(result['x-av-req-id']).toBe(result['x-av-req-id-copy']);
    });

    it('TWO_STEP: interpolates proxy.headers ${now} and uses same value across headers (stable per request)', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'TWO_STEP',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        'x-av-date': '${now}',
                        'x-av-date-copy': '${now}'
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
                    token: 't',
                    raw: {}
                }
            })
        });

        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
        expect(result['x-av-date']).toMatch(isoRegex);
        expect(result['x-av-date-copy']).toMatch(isoRegex);
        expect(result['x-av-date']).toBe(result['x-av-date-copy']);
    });

    it('TWO_STEP: interpolates proxy.headers ${now:...} with stable now', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'TWO_STEP',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        'x-date-formatted': '${now:YYYY-MM-DD}'
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
                    token: 't',
                    raw: {}
                }
            })
        });

        expect(result['x-date-formatted']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('TWO_STEP: interpolates proxy.headers with accessToken, random, now, and endpoint together', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'TWO_STEP',
                proxy: {
                    base_url: 'http://example.com',
                    headers: {
                        authorization: 'Bearer ${accessToken}',
                        'x-av-req-id': '${random}',
                        'x-av-date': '${now}',
                        'x-path': '${endpoint}'
                    }
                }
            },
            endpoint: '/v1.0/auth'
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://api.nangostarter.com',
            connection: getTestConnection({
                credentials: {
                    type: 'TWO_STEP',
                    token: 'my-access-token',
                    raw: {}
                }
            })
        });

        expect(result['authorization']).toBe('Bearer my-access-token');
        expect(result['x-path']).toBe('/v1.0/auth');
        expect(result['x-av-req-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(result['x-av-date']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
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

    it('should use ConnectWise PSA custom hostname when provided', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'BASIC',
                    proxy: {
                        base_url:
                            'https://${connectionConfig.hostname}/v4_6_release/apis/3.0 || https://${connectionConfig.subdomain}.myconnectwise.net/v4_6_release/apis/3.0'
                    }
                }
            }),
            connection: getTestConnection({
                credentials: { type: 'BASIC', username: 'testuser', password: 'testpassword' },
                connection_config: { hostname: 'psa.example.com', subdomain: 'api-na' }
            })
        });

        expect(url).toBe('https://psa.example.com/v4_6_release/apis/3.0/api/test');
    });

    it('should keep ConnectWise PSA subdomain behavior when custom hostname is absent', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'BASIC',
                    proxy: {
                        base_url:
                            'https://${connectionConfig.hostname}/v4_6_release/apis/3.0 || https://${connectionConfig.subdomain}.myconnectwise.net/v4_6_release/apis/3.0'
                    }
                }
            }),
            connection: getTestConnection({
                credentials: { type: 'BASIC', username: 'testuser', password: 'testpassword' },
                connection_config: { subdomain: 'api-na' }
            })
        });

        expect(url).toBe('https://api-na.myconnectwise.net/v4_6_release/apis/3.0/api/test');
    });

    it('should handle Proxy base URL interpolation with hostname when connection configuration param is present', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC',
                proxy: {
                    base_url: 'https://${connectionConfig.hostname} || https://amplitude.com'
                }
            }
        });

        const url = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'BASIC', username: 'testuser', password: 'testpassword' },
                connection_config: { hostname: 'analytics.eu.amplitude.com' }
            })
        });

        expect(url).toBe('https://analytics.eu.amplitude.com/api/test');
    });

    it('should handle Proxy base URL interpolation with hostname fallback when connection configuration param is absent', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC',
                proxy: {
                    base_url: 'https://${connectionConfig.hostname} || https://amplitude.com'
                }
            }
        });

        const url = buildProxyURL({
            config,
            connection: getTestConnection({
                credentials: { type: 'BASIC', username: 'testuser', password: 'testpassword' }
            })
        });

        expect(url).toBe('https://amplitude.com/api/test');
    });

    it('should fall back to second base URL when first connectionConfig param is absent (e.g. amazon-selling-partner without subdomain)', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'OAUTH2',
                    proxy: {
                        base_url:
                            'https://${connectionConfig.subdomain}-${connectionConfig.region}.amazon.com || https://sellingpartnerapi-${connectionConfig.region}.amazon.com'
                    }
                }
            }),
            connection: getTestConnection({
                credentials: { type: 'OAUTH2', access_token: 'token', raw: {} },
                connection_config: { region: 'na' }
            })
        });

        expect(url).toBe('https://sellingpartnerapi-na.amazon.com/api/test');
    });

    it('should use first base URL when subdomain connectionConfig param is present (e.g. amazon-selling-partner with subdomain)', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'OAUTH2',
                    proxy: {
                        base_url:
                            'https://${connectionConfig.subdomain}-${connectionConfig.region}.amazon.com || https://sellingpartnerapi-${connectionConfig.region}.amazon.com'
                    }
                }
            }),
            connection: getTestConnection({
                credentials: { type: 'OAUTH2', access_token: 'token', raw: {} },
                connection_config: { subdomain: 'sellingpartnerapi', region: 'eu' }
            })
        });

        expect(url).toBe('https://sellingpartnerapi-eu.amazon.com/api/test');
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
        }).toThrow(new ProxyError('invalid_query_params', 'Can not set query params in endpoint and in params'));
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

    it('should handle proxy query parameters with connection config interpolation', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'API_KEY',
                    proxy: {
                        base_url: 'https://example.com',
                        query: {
                            application_key: '${connectionConfig.application_key}',
                            accesskey: '${connectionConfig.access_key}',
                            version: 'v1'
                        }
                    }
                }
            }),
            connection: getTestConnection({
                connection_config: {
                    application_key: 'app-key-123',
                    access_key: 'access-key-456'
                }
            })
        });

        expect(url).toBe('https://example.com/api/test?application_key=app-key-123&accesskey=access-key-456&version=v1');
    });

    it('should handle proxy query parameters with simple key-value pairs', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'API_KEY',
                    proxy: {
                        base_url: 'https://example.com',
                        query: {
                            api_version: 'v2',
                            format: 'json',
                            debug: 'true'
                        }
                    }
                }
            }),
            connection: getTestConnection()
        });

        expect(url).toBe('https://example.com/api/test?api_version=v2&format=json&debug=true');
    });

    it('should handle mixed proxy query parameters (connection config and simple values)', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'API_KEY',
                    proxy: {
                        base_url: 'https://example.com',
                        query: {
                            application_key: '${connectionConfig.application_key}',
                            version: 'v1',
                            accesskey: '${connectionConfig.access_key}',
                            format: 'json'
                        }
                    }
                }
            }),
            connection: getTestConnection({
                connection_config: {
                    application_key: 'app-key-789',
                    access_key: 'access-key-101'
                }
            })
        });

        expect(url).toBe('https://example.com/api/test?application_key=app-key-789&version=v1&accesskey=access-key-101&format=json');
    });

    it('should handle proxy query parameters with missing connection config values', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'API_KEY',
                    proxy: {
                        base_url: 'https://example.com',
                        query: {
                            application_key: '${connectionConfig.application_key}',
                            version: 'v1',
                            missing_key: '${connectionConfig.missing_key}'
                        }
                    }
                }
            }),
            connection: getTestConnection({
                connection_config: {
                    application_key: 'app-key-123'
                }
            })
        });

        expect(url).toBe('https://example.com/api/test?application_key=app-key-123&version=v1');
    });

    it('should handle proxy query parameters with existing URL query params', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'API_KEY',
                    proxy: {
                        base_url: 'https://example.com',
                        query: {
                            application_key: '${connectionConfig.application_key}',
                            version: 'v1'
                        }
                    }
                },
                endpoint: '/api/test?existing=param'
            }),
            connection: getTestConnection({
                connection_config: {
                    application_key: 'app-key-123'
                }
            })
        });

        expect(url).toBe('https://example.com/api/test?existing=param&application_key=app-key-123&version=v1');
    });

    it('should interpolate ${apiKey} in the base URL', () => {
        const url = buildProxyURL({
            config: getDefaultProxy({
                provider: {
                    auth_mode: 'API_KEY',
                    proxy: {
                        base_url: 'https://${apiKey}.example.com'
                    }
                },
                endpoint: '/api/test'
            }),
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'my-secret-key' }
            })
        });

        expect(url).toBe('https://my-secret-key.example.com/api/test');
    });
});

describe('getAxiosConfiguration', () => {
    it('should set beforeRedirect by default (headers are forwarded on redirect by default)', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: { base_url: 'https://api.example.com' }
            }
        });

        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'secret' } })
        });

        expect(axiosConfig.beforeRedirect).toBeDefined();
    });

    it('should set beforeRedirect when forwardHeadersOnRedirect is false (to track metric)', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: { base_url: 'https://api.example.com' }
            },
            forwardHeadersOnRedirect: false
        });

        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'secret' } })
        });

        expect(axiosConfig.beforeRedirect).toBeDefined();
    });

    it('invokes validateProxyRedirectUrl with redirect href before other beforeRedirect work', () => {
        const seen: string[] = [];
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: { base_url: 'https://api.example.com' }
            },
            validateProxyRedirectUrl: (absoluteUrl) => {
                seen.push(absoluteUrl);
            }
        });

        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'secret' } })
        });

        const redirectDetails = { headers: {} as Record<string, string>, statusCode: 302 };
        axiosConfig.beforeRedirect!({ href: 'https://redirect.example/next', headers: {} }, redirectDetails);

        expect(seen).toEqual(['https://redirect.example/next']);
    });

    it('propagates throw from validateProxyRedirectUrl', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: { base_url: 'https://api.example.com' }
            },
            validateProxyRedirectUrl: () => {
                throw new ProxyError('proxy_redirect_to_denied_host', 'blocked');
            }
        });

        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'secret' } })
        });

        const redirectDetails = { headers: {} as Record<string, string>, statusCode: 302 };
        expect(() => axiosConfig.beforeRedirect!({ href: 'https://redirect.example/next', headers: {} }, redirectDetails)).toThrow(ProxyError);
    });
});

describe('absoluteUrlFromRedirectRequestOptions', () => {
    it('returns href when present', () => {
        expect(absoluteUrlFromRedirectRequestOptions({ href: 'https://a.example/path' })).toBe('https://a.example/path');
    });

    it('composes from protocol host path when href missing', () => {
        expect(
            absoluteUrlFromRedirectRequestOptions({
                protocol: 'https:',
                host: 'api.example.com',
                path: '/p?q=1'
            })
        ).toBe('https://api.example.com/p?q=1');
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
                docs: 'https://nango.dev/docs/api-integrations/github'
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

    it('passes through validateProxyRedirectUrl', () => {
        const validateProxyRedirectUrl = (url: string): void => {
            void url;
        };
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: 'provider-config-key-1',
            endpoint: '/api/test',
            baseUrlOverride: 'https://api.github.com.override',
            validateProxyRedirectUrl
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'github'
        };

        const res = getProxyConfiguration({ externalConfig, internalConfig });
        if (res.isErr()) {
            throw res.error;
        }

        expect(res.value.validateProxyRedirectUrl).toBe(validateProxyRedirectUrl);
    });
});
