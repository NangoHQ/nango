import { describe, expect, it, vi } from 'vitest';

import { axiosInstance } from '@nangohq/utils';

import connectionService, {
    applyIntegrationConfigToTwoStepCredentials,
    extractResponseHeaderValues,
    getPreconfiguredTwoStepFields
} from './connection.service.js';
import { REFRESH_MARGIN_MS } from './connections/utils.js';

import type { ProviderTwoStep, TwoStepCredentials } from '@nangohq/types';

describe('applyIntegrationConfigToTwoStepCredentials', () => {
    // Matches the real sage-intacct-cc shape: clientId/clientSecret live only in `integration_config` (the
    // Connect UI falls back to asking for them as regular credentials when unset — see Go.tsx).
    const provider: ProviderTwoStep = {
        display_name: 'Test',
        docs: 'https://example.com',
        auth_mode: 'TWO_STEP',
        token_response: { token: 'access_token' },
        credentials: {
            username: { type: 'string', title: 'Username', description: '', automated: false, order: 3 }
        },
        integration_config: {
            clientId: { type: 'string', title: 'Client ID', description: '', automated: false, order: 1 },
            clientSecret: { type: 'string', title: 'Client Secret', description: '', automated: false, order: 2 }
        }
    };

    it('overrides a submitted credential with the integration-level value', () => {
        const dynamicCredentials = { refresh_token: 'rt', clientId: 'from-user', clientSecret: 'from-user-secret', username: 'bob' };

        const result = applyIntegrationConfigToTwoStepCredentials(provider, dynamicCredentials, { clientId: 'from-integration', clientSecret: 'shh' });

        expect(result).toStrictEqual({ refresh_token: 'rt', clientId: 'from-integration', clientSecret: 'shh', username: 'bob' });
    });

    it('falls back to the submitted/stored credential when the integration has nothing for that key', () => {
        const dynamicCredentials = { clientId: 'from-user', username: 'bob' };

        const result = applyIntegrationConfigToTwoStepCredentials(provider, dynamicCredentials, { clientSecret: '' });

        expect(result).toStrictEqual({ clientId: 'from-user', username: 'bob' });
    });

    it('leaves credentials untouched when no integration config is set', () => {
        const dynamicCredentials = { clientId: 'from-user', username: 'bob' };

        expect(applyIntegrationConfigToTwoStepCredentials(provider, dynamicCredentials, null)).toBe(dynamicCredentials);
        expect(applyIntegrationConfigToTwoStepCredentials(provider, dynamicCredentials, undefined)).toBe(dynamicCredentials);
    });

    it('only overrides fields declared in integration_config', () => {
        const dynamicCredentials = { clientId: 'from-user', username: 'bob' };

        // "username" isn't declared in integration_config, so it must never be pulled from custom config,
        // even though the caller happens to pass a value under that key.
        const result = applyIntegrationConfigToTwoStepCredentials(provider, dynamicCredentials, { clientId: 'from-integration', username: 'someone-else' });

        expect(result).toStrictEqual({ clientId: 'from-integration', username: 'bob' });
    });
});

describe('getPreconfiguredTwoStepFields', () => {
    const provider: ProviderTwoStep = {
        display_name: 'Test',
        docs: 'https://example.com',
        auth_mode: 'TWO_STEP',
        token_response: { token: 'access_token' },
        credentials: {
            username: { type: 'string', title: 'Username', description: '', automated: false, order: 3 }
        },
        integration_config: {
            clientId: { type: 'string', title: 'Client ID', description: '', automated: false, order: 1 },
            clientSecret: { type: 'string', title: 'Client Secret', description: '', automated: false, order: 2 }
        }
    };

    it('lists integration_config fields that have a value set on the integration', () => {
        expect(getPreconfiguredTwoStepFields(provider, { clientId: 'abc', clientSecret: 'shh' })).toStrictEqual(new Set(['clientId', 'clientSecret']));
    });

    it('omits fields with no value set on the integration', () => {
        expect(getPreconfiguredTwoStepFields(provider, { clientId: 'abc', clientSecret: '' })).toStrictEqual(new Set(['clientId']));
    });

    it('is empty when there is no integration config', () => {
        expect(getPreconfiguredTwoStepFields(provider, null)).toStrictEqual(new Set());
        expect(getPreconfiguredTwoStepFields(provider, undefined)).toStrictEqual(new Set());
    });

    it('never includes fields only declared in credentials, not integration_config', () => {
        expect(getPreconfiguredTwoStepFields(provider, { username: 'bob' })).toStrictEqual(new Set());
    });
});

describe('getTwoStepCredentials', () => {
    // Mirrors sage-intacct-cc: clientId/clientSecret are only ever read from the integration's own config.
    const provider: ProviderTwoStep = {
        display_name: 'Test',
        docs: 'https://example.com',
        auth_mode: 'TWO_STEP',
        token_url: 'https://example.com/token',
        body_format: 'form',
        token_params: {
            grant_type: 'client_credentials',
            client_id: '${credentials.clientId}',
            client_secret: '${credentials.clientSecret}',
            username: '${credentials.username}'
        },
        token_response: { token: 'access_token' },
        credentials: {
            username: { type: 'string', title: 'Username', description: '', automated: false, order: 3 }
        },
        integration_config: {
            clientId: { type: 'string', title: 'Client ID', description: '', automated: false, order: 1 },
            clientSecret: { type: 'string', title: 'Client Secret', description: '', automated: false, order: 2 }
        }
    };

    it('uses the integration-level clientId/clientSecret to build the request but never persists them onto the connection', async () => {
        const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValue({ status: 200, data: { access_token: 'tok123' }, headers: {} });

        const { success, response } = await connectionService.getTwoStepCredentials('test-config', provider, { username: 'bob' }, {}, false, {
            clientId: 'integration-client-id',
            clientSecret: 'integration-secret'
        });

        expect(success).toBe(true);

        const body = postSpy.mock.calls[0]?.[1] as string;
        expect(body).toContain('client_id=integration-client-id');
        expect(body).toContain('client_secret=integration-secret');

        // The integration's own clientId/clientSecret must stay resident on the integration, not get copied
        // onto the connection — otherwise updating them on the integration wouldn't propagate to connections
        // created before the update, and they'd needlessly be exposed on the connection's credentials.
        expect(response).not.toHaveProperty('clientId');
        expect(response).not.toHaveProperty('clientSecret');
        expect(response?.['username']).toBe('bob');

        postSpy.mockRestore();
    });

    it('still persists clientId/clientSecret when the integration has nothing preconfigured', async () => {
        const postSpy = vi.spyOn(axiosInstance, 'post').mockResolvedValue({ status: 200, data: { access_token: 'tok123' }, headers: {} });

        const { success, response } = await connectionService.getTwoStepCredentials(
            'test-config',
            provider,
            { username: 'bob', clientId: 'from-user', clientSecret: 'from-user-secret' },
            {},
            false,
            null
        );

        expect(success).toBe(true);
        expect(response?.['clientId']).toBe('from-user');
        expect(response?.['clientSecret']).toBe('from-user-secret');

        postSpy.mockRestore();
    });
});

function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.fakesig`;
}

describe('connection.service parseRawCredentials', () => {
    describe('TWO_STEP token_expires_in_ms', () => {
        it('token_expires_in_ms = 0 => no expiresAt (infinite token); change this test if you change that logic', () => {
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token'
                },
                token_expires_in_ms: 0
            };
            const rawCreds = { access_token: 'some-token' };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.type).toBe('TWO_STEP');
            expect(result.expires_at).toBeUndefined();
        });
    });

    describe('TWO_STEP refresh token JWT exp introspection', () => {
        it('refresh token JWT expiry is sooner => uses refresh token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 3600; // 1h from now
            const refreshTokenExp = Math.floor(Date.now() / 1000) + 600; // 10min from now (sooner)
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: makeJwt({ exp: refreshTokenExp })
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at).toEqual(new Date(refreshTokenExp * 1000 - REFRESH_MARGIN_MS));
        });

        it('access token expiry is sooner => keeps access token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 600; // 10min from now (sooner)
            const refreshTokenExp = Math.floor(Date.now() / 1000) + 86400; // 1 day from now
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: makeJwt({ exp: refreshTokenExp })
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at!.getTime()).toBeCloseTo(accessTokenExp * 1000, -3);
        });

        it('refresh token is not a JWT => falls back to access token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 3600;
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: 'not-a-jwt-opaque-token'
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at!.getTime()).toBeCloseTo(accessTokenExp * 1000, -3);
        });

        it('refresh token looks like a JWT but payload cannot be decoded => falls back to access token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 3600;
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: 'header.!!!invalid-base64!!!.sig' // JWT-shaped but corrupted payload
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at!.getTime()).toBeCloseTo(accessTokenExp * 1000, -3);
        });

        it('refresh token JWT has no exp claim => falls back to access token expiry', () => {
            const accessTokenExp = Math.floor(Date.now() / 1000) + 3600;
            const template: ProviderTwoStep = {
                display_name: 'Test',
                docs: 'https://example.com',
                auth_mode: 'TWO_STEP',
                token_response: {
                    token: 'access_token',
                    token_expiration: 'expires',
                    token_expiration_strategy: 'expireAt',
                    refresh_token: 'refresh_token'
                }
            };
            const rawCreds = {
                access_token: 'at',
                expires: new Date(accessTokenExp * 1000).toISOString(),
                refresh_token: makeJwt({ sub: 'user123' }) // no exp
            };

            const result = connectionService.parseRawCredentials(rawCreds, 'TWO_STEP', template) as TwoStepCredentials;

            expect(result.expires_at!.getTime()).toBeCloseTo(accessTokenExp * 1000, -3);
        });
    });
});

describe('extractResponseHeaderValues', () => {
    describe('set-cookie', () => {
        it('parses a single Set-Cookie and builds _cookies', () => {
            const headers = { 'set-cookie': 'B1SESSION=abc123; HttpOnly; Secure; SameSite=None' };
            const result = extractResponseHeaderValues(headers, ['set-cookie']);
            expect(result).toEqual({ B1SESSION: 'abc123', _cookies: 'B1SESSION=abc123' });
        });

        it('parses multiple Set-Cookie headers and builds _cookies with all cookies', () => {
            const headers = {
                'set-cookie': ['B1SESSION=abc123; HttpOnly; Secure; SameSite=None', 'ROUTEID=node1; path=/; Secure; SameSite=None']
            };
            const result = extractResponseHeaderValues(headers, ['set-cookie']);
            expect(result).toEqual({ B1SESSION: 'abc123', ROUTEID: 'node1', _cookies: 'B1SESSION=abc123; ROUTEID=node1' });
        });

        it('_cookies only contains cookies that were present (single-node: no ROUTEID)', () => {
            const headers = { 'set-cookie': 'B1SESSION=abc123; HttpOnly' };
            const result = extractResponseHeaderValues(headers, ['set-cookie']);
            expect(result['_cookies']).toBe('B1SESSION=abc123');
            expect(result['ROUTEID']).toBeUndefined();
        });
    });

    describe('plain headers', () => {
        it('stores value under the header name', () => {
            const headers = { 'x-auth-token': 'tok-xyz' };
            const result = extractResponseHeaderValues(headers, ['x-auth-token']);
            expect(result).toEqual({ 'x-auth-token': 'tok-xyz' });
        });

        it('takes the first value when the header is an array', () => {
            const headers = { 'x-auth-token': ['first', 'second'] };
            const result = extractResponseHeaderValues(headers, ['x-auth-token']);
            expect(result).toEqual({ 'x-auth-token': 'first' });
        });

        it('stores under the header name', () => {
            const headers = { 'x-session-token': 'sess-99' };
            const result = extractResponseHeaderValues(headers, ['x-session-token']);
            expect(result).toEqual({ 'x-session-token': 'sess-99' });
        });
    });

    describe('shared behaviour', () => {
        it('skips missing headers', () => {
            const headers = { 'x-other': 'value' };
            const result = extractResponseHeaderValues(headers, ['set-cookie', 'x-auth-token']);
            expect(result).toEqual({});
        });

        it('is case-insensitive for header name lookup', () => {
            const headers = { 'set-cookie': 'B1SESSION=abc123; HttpOnly' };
            const result = extractResponseHeaderValues(headers, ['Set-Cookie']);
            expect(result['B1SESSION']).toBe('abc123');
            expect(result['_cookies']).toBe('B1SESSION=abc123');
        });
    });
});
