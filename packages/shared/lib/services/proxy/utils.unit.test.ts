import * as crypto from 'node:crypto';

import FormData from 'form-data';
import { describe, expect, it } from 'vitest';

import {
    ProxyError,
    absoluteUrlFromRedirectRequestOptions,
    buildCanonicalParams,
    buildProxyBody,
    buildProxyHeaders,
    buildProxyURL,
    deriveIntegrationConfigProxy,
    enforceProxyOutboundUrlPolicy,
    getAxiosConfiguration,
    getProxyConfiguration,
    proxyUsesConfigurableBaseUrlOverride
} from './utils.js';
import { getDefaultProxy } from './utils.test.js';
import { getTestConnection } from '../../seeders/connection.seeder.js';

import type { InternalProxyConfiguration, TwoStepCredentials, UserProvidedProxyConfiguration } from '@nangohq/types';

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

    it('should use the final URL host for signed proxy header interpolation', () => {
        const requestDate = 'Tue, 21 Apr 2026 12:34:56 +0000';
        const username = 'DIABCDEFGHIJKLMNOPQR';
        const password = 'secret';
        const authorizationTemplate =
            'Basic ${base64(${credentials.username}:${hmacSha1Hex(' + requestDate + '\n${method}\n${host}\n${path}\n${params}, ${credentials.password})})}';
        const expectedAuthorization = (host: string) => {
            const canonical = `${requestDate}\nGET\n${host}\n/admin/v1/users\naccount_id=DA123`;
            const signature = crypto.createHmac('sha1', password).update(canonical, 'utf8').digest('hex');
            return 'Basic ' + Buffer.from(`${username}:${signature}`).toString('base64');
        };

        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC',
                proxy: {
                    base_url: 'https://${connectionConfig.hostname}',
                    headers: {
                        authorization: authorizationTemplate
                    }
                }
            },
            endpoint: '/admin/v1/users',
            method: 'GET'
        });
        const connection = getTestConnection({
            credentials: { type: 'BASIC', username, password },
            connection_config: { hostname: 'api-parent.duosecurity.com' }
        });

        const childHeaders = buildProxyHeaders({
            config,
            url: 'https://api-child.duosecurity.com/admin/v1/users?account_id=DA123',
            connection
        });
        const parentHeaders = buildProxyHeaders({
            config,
            url: 'https://api-parent.duosecurity.com/admin/v1/users?account_id=DA123',
            connection
        });

        expect(childHeaders['authorization']).toBe(expectedAuthorization('api-child.duosecurity.com'));
        expect(childHeaders['authorization']).not.toBe(expectedAuthorization('api-parent.duosecurity.com'));
        expect(parentHeaders['authorization']).toBe(expectedAuthorization('api-parent.duosecurity.com'));
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

    describe('authorization header precedence', () => {
        it('level 1: BASIC auto-sets authorization as Basic base64', () => {
            const config = getDefaultProxy({
                provider: {
                    auth_mode: 'BASIC',
                    proxy: { base_url: '' }
                }
            });
            const result = buildProxyHeaders({
                config,
                url: 'https://api.example.com',
                connection: getTestConnection({
                    credentials: { type: 'BASIC', username: 'user', password: 'pass' }
                })
            });
            expect(result['authorization']).toBe('Basic ' + Buffer.from('user:pass').toString('base64'));
        });

        it('level 2: provider proxy.headers authorization overrides the BASIC auto-header', () => {
            const config = getDefaultProxy({
                provider: {
                    auth_mode: 'BASIC',
                    proxy: {
                        base_url: '',
                        headers: {
                            authorization: 'ApiKey ${credentials.username}'
                        }
                    }
                }
            });
            const result = buildProxyHeaders({
                config,
                url: 'https://api.example.com',
                connection: getTestConnection({
                    credentials: { type: 'BASIC', username: 'my-api-key', password: 'ignored' }
                })
            });
            // Provider config wins over the automatic Basic header
            expect(result['authorization']).toBe('ApiKey my-api-key');
        });

        it('level 3: script config.headers authorization overrides provider proxy.headers', () => {
            const config = getDefaultProxy({
                provider: {
                    auth_mode: 'BASIC',
                    proxy: {
                        base_url: '',
                        headers: {
                            authorization: 'ApiKey ${credentials.username}'
                        }
                    }
                },
                headers: {
                    authorization: 'Bearer script-token'
                }
            });
            const result = buildProxyHeaders({
                config,
                url: 'https://api.example.com',
                connection: getTestConnection({
                    credentials: { type: 'BASIC', username: 'my-api-key', password: 'ignored' }
                })
            });
            // Script header wins over both provider config and BASIC auto-header
            expect(result['authorization']).toBe('Bearer script-token');
        });

        it('all three: script > provider config > BASIC auto — final winner is the script header', () => {
            const basicEncoded = Buffer.from('user:pass').toString('base64');
            const config = getDefaultProxy({
                provider: {
                    auth_mode: 'BASIC',
                    proxy: {
                        base_url: '',
                        headers: {
                            authorization: 'ApiKey ${credentials.username}'
                        }
                    }
                },
                headers: {
                    authorization: 'Bearer script-token'
                }
            });
            const result = buildProxyHeaders({
                config,
                url: 'https://api.example.com',
                connection: getTestConnection({
                    credentials: { type: 'BASIC', username: 'user', password: 'pass' }
                })
            });
            expect(result['authorization']).not.toBe(`Basic ${basicEncoded}`); // BASIC auto-header lost
            expect(result['authorization']).not.toBe('ApiKey user'); // provider config lost
            expect(result['authorization']).toBe('Bearer script-token'); // script won
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

    it('should include caller-supplied headers in the AWS SigV4 SignedHeaders list', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'AWS_SIGV4',
                proxy: { base_url: 'https://dynamodb.us-east-1.amazonaws.com' }
            },
            headers: {
                'x-amz-target': 'DynamoDB_20120810.GetItem',
                'content-type': 'application/x-amz-json-1.0'
            }
        });

        const result = buildProxyHeaders({
            config,
            url: 'https://dynamodb.us-east-1.amazonaws.com/',
            connection: getTestConnection({
                credentials: {
                    type: 'AWS_SIGV4',
                    raw: {},
                    role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                    region: 'us-east-1',
                    service: 'dynamodb',
                    access_key_id: 'AKIDEXAMPLE',
                    secret_access_key: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
                    session_token: 'session-token'
                }
            })
        });

        // SignedHeaders must mention x-amz-target so AWS verifies the signature over it;
        // omitting it produces SignatureDoesNotMatch for DynamoDB-style APIs.
        expect(result['authorization']).toMatch(/SignedHeaders=[^,]*\bx-amz-target\b/);
        expect(result['authorization']).toMatch(/SignedHeaders=[^,]*\bcontent-type\b/);
        expect(result['x-amz-target']).toBe('DynamoDB_20120810.GetItem');
        expect(result['content-type']).toBe('application/x-amz-json-1.0');
    });
});

describe('proxyUsesConfigurableBaseUrlOverride', () => {
    it('returns true for AWS SigV4 per-connection base_url', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'AWS_SIGV4',
                proxy: { base_url: 'https://dynamodb.us-east-1.amazonaws.com' }
            }
        });
        const connection = getTestConnection({
            credentials: {
                type: 'AWS_SIGV4',
                raw: {},
                role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                region: 'us-east-1',
                service: 'dynamodb',
                access_key_id: 'AKIDEXAMPLE',
                secret_access_key: 'secret',
                session_token: 'token'
            },
            connection_config: { base_url: 'http://localhost:4566' }
        });

        expect(proxyUsesConfigurableBaseUrlOverride({ proxyConfig: config, connection })).toBe(true);
    });

    it('returns false for AWS SigV4 without per-connection base_url', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'AWS_SIGV4',
                proxy: { base_url: 'https://dynamodb.us-east-1.amazonaws.com' }
            }
        });
        const connection = getTestConnection({
            credentials: {
                type: 'AWS_SIGV4',
                raw: {},
                role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                region: 'us-east-1',
                service: 'dynamodb',
                access_key_id: 'AKIDEXAMPLE',
                secret_access_key: 'secret',
                session_token: 'token'
            }
        });

        expect(proxyUsesConfigurableBaseUrlOverride({ proxyConfig: config, connection })).toBe(false);
    });
});

describe('enforceProxyOutboundUrlPolicy', () => {
    it('blocks denylisted resolved URLs from AWS SigV4 connection base_url', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'AWS_SIGV4',
                proxy: { base_url: 'https://dynamodb.us-east-1.amazonaws.com' }
            },
            endpoint: '/'
        });
        const connection = getTestConnection({
            credentials: {
                type: 'AWS_SIGV4',
                raw: {},
                role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                region: 'us-east-1',
                service: 'dynamodb',
                access_key_id: 'AKIDEXAMPLE',
                secret_access_key: 'secret',
                session_token: 'token'
            },
            connection_config: { base_url: 'http://localhost:4566' }
        });
        const absoluteUrl = buildProxyURL({ config, connection });

        expect(() =>
            enforceProxyOutboundUrlPolicy({
                absoluteUrl,
                proxyConfig: config,
                connection,
                overrideEnabled: true,
                denylist: new Set(['localhost'])
            })
        ).toThrow(
            expect.objectContaining({
                code: 'base_url_override_not_allowed'
            })
        );
    });
});

describe('buildProxyURL', () => {
    it('uses AWS SigV4 per-connection base_url when no explicit override is set', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'AWS_SIGV4',
                proxy: { base_url: 'https://dynamodb.us-east-1.amazonaws.com' }
            },
            endpoint: '/tables'
        });
        const connection = getTestConnection({
            credentials: {
                type: 'AWS_SIGV4',
                raw: {},
                role_arn: 'arn:aws:iam::123456789012:role/TestRole',
                region: 'us-east-1',
                service: 'dynamodb',
                access_key_id: 'AKIDEXAMPLE',
                secret_access_key: 'secret',
                session_token: 'token'
            },
            connection_config: { base_url: 'http://localhost:4566' }
        });

        expect(buildProxyURL({ config, connection })).toBe('http://localhost:4566/tables');
    });

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

    it('should not forward headers when forwardHeadersOnRedirect is false', () => {
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

        const redirectOptions: Record<string, any> = { headers: {} };
        (axiosConfig.beforeRedirect as (opts: Record<string, any>) => void)(redirectOptions);
        expect(redirectOptions['headers']['authorization']).toBeUndefined();
    });

    it('should forward headers when forwardHeadersOnRedirect is true', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'OAUTH2',
                proxy: { base_url: 'https://api.example.com' }
            },
            forwardHeadersOnRedirect: true
        });

        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'OAUTH2', access_token: 'tok123', raw: {} } })
        });

        const redirectOptions: Record<string, any> = { headers: {} };
        (axiosConfig.beforeRedirect as (opts: Record<string, any>) => void)(redirectOptions);
        expect(redirectOptions['headers']['authorization']).toBe('Bearer tok123');
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
        const requestDetails = { headers: {} as Record<string, string>, url: 'https://api.example.com', method: 'GET' };
        axiosConfig.beforeRedirect!({ href: 'https://redirect.example/next', headers: {} }, redirectDetails, requestDetails);

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
        const requestDetails = { headers: {} as Record<string, string>, url: 'https://api.example.com', method: 'GET' };
        expect(() => axiosConfig.beforeRedirect!({ href: 'https://redirect.example/next', headers: {} }, redirectDetails, requestDetails)).toThrow(ProxyError);
    });

    it('invokes validateProxyRequestUrl with the resolved outbound URL', () => {
        const seen: string[] = [];
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: { base_url: 'https://api.example.com' }
            },
            endpoint: '/v1/items',
            validateProxyRequestUrl: ({ absoluteUrl }) => {
                seen.push(absoluteUrl);
            }
        });

        getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'secret' } })
        });

        expect(seen).toEqual(['https://api.example.com/v1/items']);
    });

    it('propagates throw from validateProxyRequestUrl', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: { base_url: 'https://api.example.com' }
            },
            validateProxyRequestUrl: () => {
                throw new ProxyError('base_url_override_not_allowed', 'blocked');
            }
        });

        expect(() =>
            getAxiosConfiguration({
                proxyConfig: config,
                connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'secret' } })
            })
        ).toThrow(ProxyError);
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

    it('passes through validateProxyRequestUrl', () => {
        const validateProxyRequestUrl = (): void => {};
        const externalConfig: UserProvidedProxyConfiguration = {
            method: 'GET',
            providerConfigKey: 'provider-config-key-1',
            endpoint: '/api/test',
            validateProxyRequestUrl
        };
        const internalConfig: InternalProxyConfiguration = {
            providerName: 'github'
        };

        const res = getProxyConfiguration({ externalConfig, internalConfig });
        if (res.isErr()) {
            throw res.error;
        }

        expect(res.value.validateProxyRequestUrl).toBe(validateProxyRequestUrl);
    });
});

describe('buildCanonicalParams', () => {
    describe('GET — query string from endpoint', () => {
        it('returns empty string when no query string', () => {
            expect(buildCanonicalParams('GET', undefined, '')).toBe('');
        });

        it('returns single param encoded', () => {
            expect(buildCanonicalParams('GET', undefined, 'username=root')).toBe('username=root');
        });

        it('sorts params lexicographically by key', () => {
            expect(buildCanonicalParams('GET', undefined, 'username=root&realname=First Last')).toBe('realname=First%20Last&username=root');
        });

        it('uses uppercase hex digits', () => {
            expect(buildCanonicalParams('GET', undefined, 'email=user@example.com')).toBe('email=user%40example.com');
        });

        it('does not encode RFC 3986 unreserved chars (A-Za-z0-9 - _ . ~)', () => {
            expect(buildCanonicalParams('GET', undefined, 'q=hello-world_test.value~')).toBe('q=hello-world_test.value~');
        });

        it('decodes then re-encodes existing encoding', () => {
            // input already has %20, should decode and re-encode with uppercase
            expect(buildCanonicalParams('GET', undefined, 'realname=First%20Last&username=root')).toBe('realname=First%20Last&username=root');
        });

        it('handles multiple params already sorted', () => {
            expect(buildCanonicalParams('GET', undefined, 'limit=10&offset=0')).toBe('limit=10&offset=0');
        });
    });

    describe('DELETE — same as GET (query string)', () => {
        it('uses query string for DELETE', () => {
            expect(buildCanonicalParams('DELETE', undefined, 'id=123')).toBe('id=123');
        });
    });

    describe('POST — body params (Buffer)', () => {
        it('parses form-encoded Buffer body', () => {
            const body = Buffer.from('name=My%20Group&desc=Test');
            expect(buildCanonicalParams('POST', body, '')).toBe('desc=Test&name=My%20Group');
        });

        it('returns empty string for empty Buffer', () => {
            expect(buildCanonicalParams('POST', Buffer.from(''), '')).toBe('');
        });
    });

    describe('POST — body params (string)', () => {
        it('parses form-encoded string body', () => {
            expect(buildCanonicalParams('POST', 'name=My%20Group', '')).toBe('name=My%20Group');
        });

        it('strips leading ? from string body', () => {
            expect(buildCanonicalParams('POST', '?name=test', '')).toBe('name=test');
        });

        it('sorts string body params', () => {
            expect(buildCanonicalParams('POST', 'username=root&realname=First%20Last', '')).toBe('realname=First%20Last&username=root');
        });
    });

    describe('POST — body params (plain object)', () => {
        it('encodes plain object body', () => {
            expect(buildCanonicalParams('POST', { name: 'My Group' }, '')).toBe('name=My%20Group');
        });

        it('sorts plain object keys', () => {
            expect(buildCanonicalParams('POST', { username: 'root', realname: 'First Last' }, '')).toBe('realname=First%20Last&username=root');
        });

        it('returns empty string for null data', () => {
            expect(buildCanonicalParams('POST', null, '')).toBe('');
        });

        it('returns empty string for FormData', () => {
            expect(buildCanonicalParams('POST', new FormData(), '')).toBe('');
        });
    });

    describe('encoding correctness', () => {
        it('encodes space as %20 (not +)', () => {
            expect(buildCanonicalParams('GET', undefined, 'q=hello world')).toBe('q=hello%20world');
        });

        it('encodes @ with uppercase hex', () => {
            expect(buildCanonicalParams('GET', undefined, 'email=a@b.com')).toBe('email=a%40b.com');
        });

        it('encodes ! ( ) * with uppercase hex', () => {
            const result = buildCanonicalParams('GET', undefined, 'q=a!b(c)d*e');
            expect(result).toBe('q=a%21b%28c%29d%2Ae');
        });
    });
});

describe('buildProxyHeaders TWO_STEP', () => {
    const twoStepBase = {
        auth_mode: 'TWO_STEP' as const,
        display_name: 'Test',
        docs: '',
        token_response: { token: 'token' }
    };

    const twoStepConnection = getTestConnection({
        credentials: { type: 'TWO_STEP', token: 'sess-token-123' } as unknown as TwoStepCredentials
    });

    it('adds Bearer by default when no proxy headers are configured', () => {
        const config = getDefaultProxy({ provider: { ...twoStepBase, proxy: { base_url: '' } } });
        const headers = buildProxyHeaders({ config, url: 'https://example.com', connection: twoStepConnection });
        expect(headers['authorization']).toBe('Bearer sess-token-123');
    });

    it('adds Bearer when proxy headers do not contain ${accessToken} or cookie', () => {
        const config = getDefaultProxy({
            provider: { ...twoStepBase, proxy: { base_url: '', headers: { 'x-custom': 'value' } } }
        });
        const headers = buildProxyHeaders({ config, url: 'https://example.com', connection: twoStepConnection });
        expect(headers['authorization']).toBe('Bearer sess-token-123');
    });

    it('still adds Bearer when cookie header does not reference ${credentials._cookies}', () => {
        const config = getDefaultProxy({
            provider: { ...twoStepBase, proxy: { base_url: '', headers: { cookie: 'static=value' } } }
        });
        const headers = buildProxyHeaders({ config, url: 'https://example.com', connection: twoStepConnection });
        expect(headers['authorization']).toBe('Bearer sess-token-123');
    });

    it('suppresses Bearer when a proxy header contains ${accessToken}', () => {
        const config = getDefaultProxy({
            provider: { ...twoStepBase, proxy: { base_url: '', headers: { 'x-token': '${accessToken}' } } }
        });
        const headers = buildProxyHeaders({ config, url: 'https://example.com', connection: twoStepConnection });
        expect(headers['authorization']).toBeUndefined();
        expect(headers['x-token']).toBe('sess-token-123');
    });

    it('suppresses Bearer when a cookie proxy header is present (session-cookie auth)', () => {
        const config = getDefaultProxy({
            provider: {
                ...twoStepBase,
                proxy: { base_url: '', headers: { cookie: '${credentials._cookies}' } }
            }
        });
        const connection = getTestConnection({
            credentials: { type: 'TWO_STEP', token: 'sess-token-123', _cookies: 'B1SESSION=sess-token-123; ROUTEID=node1' } as unknown as TwoStepCredentials
        });
        const headers = buildProxyHeaders({ config, url: 'https://example.com', connection });
        expect(headers['authorization']).toBeUndefined();
        expect(headers['cookie']).toBe('B1SESSION=sess-token-123; ROUTEID=node1');
    });

    it('cookie header resolves to only B1SESSION when ROUTEID is absent (single-node)', () => {
        const config = getDefaultProxy({
            provider: {
                ...twoStepBase,
                proxy: { base_url: '', headers: { cookie: '${credentials._cookies}' } }
            }
        });
        const connection = getTestConnection({
            credentials: { type: 'TWO_STEP', token: 'sess-token-123', _cookies: 'B1SESSION=sess-token-123' } as unknown as TwoStepCredentials
        });
        const headers = buildProxyHeaders({ config, url: 'https://example.com', connection });
        expect(headers['authorization']).toBeUndefined();
        expect(headers['cookie']).toBe('B1SESSION=sess-token-123');
    });
});

describe('deriveIntegrationConfigProxy (private-api-generic style)', () => {
    const genericProvider = {
        auth_mode: 'API_KEY' as const,
        display_name: 'Private API (Generic)',
        docs: '',
        // presence of integration_config opts the provider into per-integration proxy injection
        integration_config: { keyPlacement: { type: 'string' as const, title: 'Key placement', description: '', order: 1, automated: false } },
        proxy: { base_url: 'https://my-private-api' }
    };

    it('injects the API key into a custom header using the value template', () => {
        const config = getDefaultProxy({ provider: genericProvider });
        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'secret-key' } }),
            integrationConfig: {
                oauth_client_id: null,
                oauth_client_secret: null,
                custom: { keyPlacement: 'header', keyName: 'Authorization', valueTemplate: 'Api-Key ${apiKey}', baseUrl: 'https://api.example.com' }
            }
        });

        expect((axiosConfig.headers as Record<string, string>)['authorization']).toBe('Api-Key secret-key');
        expect(axiosConfig.url).toBe('https://api.example.com/api/test');
    });

    it('injects the API key into a custom non-Authorization header', () => {
        const config = getDefaultProxy({ provider: genericProvider });
        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'abc' } }),
            integrationConfig: {
                oauth_client_id: null,
                oauth_client_secret: null,
                custom: { keyPlacement: 'header', keyName: 'x-ai-calls-api-key', valueTemplate: '${apiKey}', baseUrl: 'https://api.example.com' }
            }
        });

        expect((axiosConfig.headers as Record<string, string>)['x-ai-calls-api-key']).toBe('abc');
    });

    it('injects the API key into a query param', () => {
        const config = getDefaultProxy({ provider: genericProvider });
        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'qkey' } }),
            integrationConfig: {
                oauth_client_id: null,
                oauth_client_secret: null,
                custom: { keyPlacement: 'query', keyName: 'api_key', valueTemplate: '${apiKey}', baseUrl: 'https://api.example.com' }
            }
        });

        expect(axiosConfig.url).toBe('https://api.example.com/api/test?api_key=qkey');
    });

    it('is a no-op when the provider does not declare integration_config', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                display_name: 'x',
                docs: '',
                proxy: { base_url: 'https://static.example.com', headers: { authorization: 'Bearer ${apiKey}' } }
            }
        });
        const derived = deriveIntegrationConfigProxy({
            proxyConfig: config,
            integrationConfig: { oauth_client_id: null, oauth_client_secret: null, custom: { keyName: 'Authorization', valueTemplate: '${apiKey}' } }
        });
        expect(derived).toBe(config);
    });

    it('does not duplicate the base when the endpoint is absolute and equals the custom base', () => {
        const config = getDefaultProxy({ provider: genericProvider, endpoint: 'https://api.example.com/users' });
        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'k' } }),
            integrationConfig: {
                oauth_client_id: null,
                oauth_client_secret: null,
                custom: { keyPlacement: 'header', keyName: 'Authorization', valueTemplate: '${apiKey}', baseUrl: 'https://api.example.com' }
            }
        });

        expect(axiosConfig.url).toBe('https://api.example.com/users');
    });

    it('does not duplicate the base when the absolute endpoint continues with a query string', () => {
        const config = getDefaultProxy({ provider: genericProvider, endpoint: 'https://api.example.com?foo=1' });
        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'k' } }),
            integrationConfig: {
                oauth_client_id: null,
                oauth_client_secret: null,
                custom: { keyPlacement: 'header', keyName: 'Authorization', valueTemplate: '${apiKey}', baseUrl: 'https://api.example.com' }
            }
        });

        const parsed = new URL(axiosConfig.url as string);
        expect(parsed.host).toBe('api.example.com');
        expect(parsed.searchParams.get('foo')).toBe('1');
    });

    it('does not rewrite a different host that merely shares the base string prefix', () => {
        const config = getDefaultProxy({ provider: genericProvider, endpoint: 'https://api.example.com.evil.com/x' });
        const axiosConfig = getAxiosConfiguration({
            proxyConfig: config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'k' } }),
            integrationConfig: {
                oauth_client_id: null,
                oauth_client_secret: null,
                custom: { keyPlacement: 'header', keyName: 'Authorization', valueTemplate: '${apiKey}', baseUrl: 'https://api.example.com' }
            }
        });

        // The base is not stripped (no path boundary), so the request stays under the configured host, not evil.com.
        expect(new URL(axiosConfig.url as string).host).toBe('api.example.com');
    });
});

describe('buildProxyBody', () => {
    it('returns null when provider has no proxy.body defined', () => {
        const config = getDefaultProxy({
            provider: { auth_mode: 'API_KEY', proxy: { base_url: 'https://example.com' } }
        });
        expect(buildProxyBody({ config, connection: getTestConnection() })).toBeNull();
    });

    it('returns null when proxy.body is empty', () => {
        const config = getDefaultProxy({
            provider: { auth_mode: 'API_KEY', proxy: { base_url: 'https://example.com', body: {} } }
        });
        expect(buildProxyBody({ config, connection: getTestConnection() })).toBeNull();
    });

    it('includes literal values that contain no $ placeholders', () => {
        const config = getDefaultProxy({
            provider: { auth_mode: 'API_KEY', proxy: { base_url: 'https://example.com', body: { grant_type: 'client_credentials' } } }
        });
        const result = buildProxyBody({ config, connection: getTestConnection() });
        expect(result).toEqual({ grant_type: 'client_credentials' });
    });

    it('interpolates ${apiKey} for API_KEY credentials', () => {
        const config = getDefaultProxy({
            provider: { auth_mode: 'API_KEY', proxy: { base_url: 'https://example.com', body: { token: '${apiKey}' } } }
        });
        const result = buildProxyBody({
            config,
            connection: getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'my-secret-key' } })
        });
        expect(result).toEqual({ token: 'my-secret-key' });
    });

    it('interpolates ${access_token} for OAUTH2 credentials', () => {
        const config = getDefaultProxy({
            provider: { auth_mode: 'OAUTH2', proxy: { base_url: 'https://example.com', body: { bearer: '${access_token}' } } }
        });
        const result = buildProxyBody({
            config,
            connection: getTestConnection({ credentials: { type: 'OAUTH2', access_token: 'oauth-tok', raw: {} } })
        });
        expect(result).toEqual({ bearer: 'oauth-tok' });
    });

    it('interpolates ${username} and ${password} for BASIC credentials', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'BASIC',
                proxy: { base_url: 'https://example.com', body: { user: '${username}', pass: '${password}' } }
            }
        });
        const result = buildProxyBody({
            config,
            connection: getTestConnection({ credentials: { type: 'BASIC', username: 'alice', password: 'secret' } })
        });
        expect(result).toEqual({ user: 'alice', pass: 'secret' });
    });

    it('interpolates ${credentials.token} for TWO_STEP credentials', () => {
        const config = getDefaultProxy({
            provider: { auth_mode: 'TWO_STEP', proxy: { base_url: 'https://example.com', body: { session: '${credentials.token}' } } }
        });
        const result = buildProxyBody({
            config,
            connection: getTestConnection({ credentials: { type: 'TWO_STEP', token: 'sess-abc' } as any })
        });
        expect(result).toEqual({ session: 'sess-abc' });
    });

    it('omits a key whose placeholder cannot be resolved', () => {
        const config = getDefaultProxy({
            provider: { auth_mode: 'OAUTH2', proxy: { base_url: 'https://example.com', body: { token: '${apiKey}' } } }
        });
        const result = buildProxyBody({
            config,
            connection: getTestConnection({ credentials: { type: 'OAUTH2', access_token: 'tok', raw: {} } })
        });
        expect(result).toBeNull();
    });

    it('interpolates connectionConfig values', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: { base_url: 'https://example.com', body: { account: '${connectionConfig.account_id}' } }
            }
        });
        const result = buildProxyBody({
            config,
            connection: getTestConnection({ connection_config: { account_id: 'acct-123' } })
        });
        expect(result).toEqual({ account: 'acct-123' });
    });

    it('omits a connectionConfig key when the value is missing from connection_config', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: { base_url: 'https://example.com', body: { account: '${connectionConfig.account_id}' } }
            }
        });
        const result = buildProxyBody({ config, connection: getTestConnection({ connection_config: {} }) });
        expect(result).toBeNull();
    });

    it('mixes literal, credential, and connectionConfig values in one body', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: 'https://example.com',
                    body: { grant_type: 'password', api_key: '${apiKey}', tenant: '${connectionConfig.tenant_id}' }
                }
            }
        });
        const result = buildProxyBody({
            config,
            connection: getTestConnection({
                credentials: { type: 'API_KEY', apiKey: 'key-abc' },
                connection_config: { tenant_id: 'tenant-xyz' }
            })
        });
        expect(result).toEqual({ grant_type: 'password', api_key: 'key-abc', tenant: 'tenant-xyz' });
    });

    it('skips non-string values in proxy.body', () => {
        const config = getDefaultProxy({
            provider: {
                auth_mode: 'API_KEY',
                proxy: {
                    base_url: 'https://example.com',
                    body: { count: 42 as unknown as string, label: 'static' }
                }
            }
        });
        const result = buildProxyBody({ config, connection: getTestConnection() });
        expect(result).toEqual({ label: 'static' });
    });
});
