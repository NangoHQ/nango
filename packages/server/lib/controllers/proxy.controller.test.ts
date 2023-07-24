import { expect, describe, it } from 'vitest';
import proxyController from './proxy.controller.js';
import { HTTP_VERB, AuthModes } from '@nangohq/shared';

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
            }
        };

        // @ts-ignore
        const headers = proxyController.constructHeaders(config);

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
        const result = proxyController.constructHeaders(config);

        expect(result).toEqual({
            Authorization: 'Basic ' + Buffer.from('testuser:testpassword').toString('base64')
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
        const result = proxyController.constructHeaders(config);

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
        const result = proxyController.constructHeaders(config);

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
        const result = proxyController.constructHeaders(config);

        expect(result).toEqual({
            Authorization: 'Bearer testtoken'
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
        const result = proxyController.constructHeaders(config);

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
            endpoint: 'api/test'
        };
        const connection = {};

        // @ts-ignore
        const result = proxyController.constructUrl(config, connection);

        expect(result).toBe('https://example.com/api/test');
    });

    it('should correctly construct url with trailing slash in base and leading slash in endpoint', () => {
        const config = {
            template: {
                proxy: {
                    base_url: 'https://example.com/'
                }
            },
            endpoint: '/api/test'
        };
        const connection = {};

        // @ts-ignore
        const result = proxyController.constructUrl(config, connection);

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
            baseUrlOverride: 'https://override.com'
        };
        const connection = {}; // Fill this based on your Connection interface

        // @ts-ignore
        const result = proxyController.constructUrl(config, connection);

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
            baseUrlOverride: 'https://override.com'
        };
        const connection = {}; // Fill this based on your Connection interface

        // @ts-ignore
        const result = proxyController.constructUrl(config, connection);

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
            baseUrlOverride: 'https://override.com'
        };
        const connection = {}; // Fill this based on your Connection interface

        // @ts-ignore
        const result = proxyController.constructUrl(config, connection);

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
            baseUrlOverride: 'https://override.com'
        };
        const connection = {};

        // @ts-ignore
        const result = proxyController.constructUrl(config, connection);

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
            baseUrlOverride: 'https://override.com'
        };
        const connection = {};

        // @ts-ignore
        const result = proxyController.constructUrl(config, connection);

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
            baseUrlOverride: 'https://override.com'
        };
        const connection = {};

        // @ts-ignore
        const url = proxyController.constructUrl(config, connection);

        expect(url).toBe('https://override.com/api/test?foo=bar&api_key=sweet-secret-token');

        // @ts-ignore
        const headers = proxyController.constructHeaders(config);

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
                    base_url: 'https://www.zohoapis.${connectionConfig.params.extension}'
                }
            },
            token: { apiKey: 'sweet-secret-token' },
            endpoint: '/api/test'
        };

        const connection = {
            connection_config: { 'connectionConfig.params.extension': 'eu' }
        };

        // @ts-ignore
        const url = proxyController.constructUrl(config, connection);

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
            endpoint: '/api/test'
        };

        const connection = {
            metadata: { instance_url: 'https://myinstanceurl.com' }
        };

        // @ts-ignore
        const url = proxyController.constructUrl(config, connection);

        expect(url).toBe('https://myinstanceurl.com/api/test');
    });
});
