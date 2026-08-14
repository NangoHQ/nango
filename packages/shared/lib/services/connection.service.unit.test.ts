import { afterEach, describe, expect, it, vi } from 'vitest';

import { axiosInstance, Err, Ok } from '@nangohq/utils';

import { NangoError } from '../utils/error.js';
import configService from './config.service.js';
import connectionService, {
    applyIntegrationConfigToTwoStepCredentials,
    ConnectionService,
    extractResponseHeaderValues,
    getPreconfiguredTwoStepFields
} from './connection.service.js';
import { refreshOrTestCredentials } from './connections/credentials/refresh.js';
import { REFRESH_MARGIN_MS } from './connections/utils.js';

import type { Config } from '../models/index.js';
import type { ConnectionWithDetails } from './connection.service.js';
import type { DBConnectionDecrypted, DBEnvironment, DBTeam, ProviderTwoStep, TwoStepCredentials } from '@nangohq/types';

describe('ConnectionService.getConnectionWithCredentials', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('retrieves connection details and removes OAuth refresh tokens by default', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(retrievalIntegrationFixture());
        const connection = decryptedConnectionFixture();
        const refreshedConnection = decryptedConnectionFixture();
        const refresh = vi.fn<typeof refreshOrTestCredentials>().mockResolvedValue(Ok(refreshedConnection));
        const service = new ConnectionService({ configService, refreshOrTestCredentials: refresh });
        const getConnectionSpy = vi.spyOn(service, 'getConnection').mockResolvedValue({ success: true, response: connection, error: null });
        const getDetailsSpy = vi.spyOn(service, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));

        const result = await service.getConnectionWithCredentials({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'github',
            forceRefresh: true,
            refreshGithubAppJwtToken: true,
            ...refreshHooks()
        });

        expect(getConnectionSpy).toHaveBeenCalledWith('connection-id', 'github', 42);
        expect(getDetailsSpy).toHaveBeenCalledWith({
            connectionId: 'connection-id',
            providerConfigKey: 'github',
            environmentId: 42,
            connection: refreshedConnection
        });
        expect(refresh).toHaveBeenCalledWith(
            expect.objectContaining({ instantRefresh: true, refreshGithubAppJwtToken: true, integration: expect.objectContaining({ unique_key: 'github' }) })
        );
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.credentials).toStrictEqual({
                type: 'OAUTH2',
                access_token: 'access-token',
                raw: { token_type: 'bearer' }
            });
            expect(result.value.connection).not.toHaveProperty('credentials');
            expect(result.value).toMatchObject({ provider: 'github', activeLogs: [{ type: 'auth', log_id: 'log-id' }], endUser: null });
        }
    });

    it('removes TWO_STEP refresh tokens by default', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(retrievalIntegrationFixture());
        const refreshedConnection: DBConnectionDecrypted = {
            ...decryptedConnectionFixture(),
            credentials: {
                type: 'TWO_STEP',
                token: 'access-token',
                refresh_token: 'refresh-token',
                raw: { token_type: 'bearer', refresh_token: 'raw-refresh-token' }
            }
        };
        const refresh = vi.fn<typeof refreshOrTestCredentials>().mockResolvedValue(Ok(refreshedConnection));
        const service = new ConnectionService({ configService, refreshOrTestCredentials: refresh });
        vi.spyOn(service, 'getConnection').mockResolvedValue({ success: true, response: decryptedConnectionFixture(), error: null });
        vi.spyOn(service, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));

        const result = await service.getConnectionWithCredentials({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'github',
            ...refreshHooks()
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.credentials).toStrictEqual({
                type: 'TWO_STEP',
                token: 'access-token',
                raw: { token_type: 'bearer' }
            });
        }
    });

    it('removes nested OAuth refresh tokens from CUSTOM credentials by default', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(retrievalIntegrationFixture());
        const refreshedConnection: DBConnectionDecrypted = {
            ...decryptedConnectionFixture(),
            credentials: {
                type: 'CUSTOM',
                app: { type: 'APP', access_token: 'app-access-token', raw: { token_type: 'bearer' } },
                user: {
                    type: 'OAUTH2',
                    access_token: 'user-access-token',
                    refresh_token: 'refresh-token',
                    raw: { token_type: 'bearer', refresh_token: 'raw-refresh-token' }
                },
                raw: { token_type: 'bearer' }
            }
        };
        const refresh = vi.fn<typeof refreshOrTestCredentials>().mockResolvedValue(Ok(refreshedConnection));
        const service = new ConnectionService({ configService, refreshOrTestCredentials: refresh });
        vi.spyOn(service, 'getConnection').mockResolvedValue({ success: true, response: decryptedConnectionFixture(), error: null });
        vi.spyOn(service, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));

        const result = await service.getConnectionWithCredentials({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'github',
            ...refreshHooks()
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.credentials).toStrictEqual({
                type: 'CUSTOM',
                app: { type: 'APP', access_token: 'app-access-token', raw: { token_type: 'bearer' } },
                user: {
                    type: 'OAUTH2',
                    access_token: 'user-access-token',
                    raw: { token_type: 'bearer' }
                },
                raw: { token_type: 'bearer' }
            });
        }
    });

    it('preserves OAuth refresh tokens when explicitly requested', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(retrievalIntegrationFixture());
        const refresh = vi.fn<typeof refreshOrTestCredentials>().mockResolvedValue(Ok(decryptedConnectionFixture()));
        const service = new ConnectionService({ configService, refreshOrTestCredentials: refresh });
        vi.spyOn(service, 'getConnection').mockResolvedValue({ success: true, response: decryptedConnectionFixture(), error: null });
        vi.spyOn(service, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));

        const result = await service.getConnectionWithCredentials({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'github',
            returnRefreshToken: true,
            ...refreshHooks()
        });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.credentials).toMatchObject({ refresh_token: 'refresh-token', raw: { refresh_token: 'raw-refresh-token' } });
        }
    });

    it('returns typed errors for unknown integrations and connections', async () => {
        const getIntegration = vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(null);
        const service = new ConnectionService({ configService, refreshOrTestCredentials });
        const getConnection = vi.spyOn(service, 'getConnection');

        const unknownIntegration = await service.getConnectionWithCredentials({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'missing',
            ...refreshHooks()
        });
        expect(unknownIntegration.isErr() && unknownIntegration.error.code).toBe('unknown_provider_config');
        expect(getConnection).not.toHaveBeenCalled();

        getIntegration.mockResolvedValue(retrievalIntegrationFixture());
        getConnection.mockResolvedValue({ success: false, response: null, error: new NangoError('unknown_connection') });
        const unknownConnection = await service.getConnectionWithCredentials({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'missing',
            integrationId: 'github',
            ...refreshHooks()
        });
        expect(unknownConnection.isErr() && unknownConnection.error.code).toBe('not_found');
    });

    it('returns invalid credential details with a credential-free enriched connection', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(retrievalIntegrationFixture());
        const credentialError = new NangoError('connection_refresh_exhausted', { reason: 'exhausted', connection: { secret: true } }, 424);
        const refresh = vi.fn<typeof refreshOrTestCredentials>().mockResolvedValue(Err(credentialError));
        const service = new ConnectionService({ configService, refreshOrTestCredentials: refresh });
        const connection = decryptedConnectionFixture();
        vi.spyOn(service, 'getConnection').mockResolvedValue({ success: true, response: connection, error: null });
        const getDetailsSpy = vi.spyOn(service, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));

        const result = await service.getConnectionWithCredentials({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'github',
            ...refreshHooks()
        });

        expect(result.isErr()).toBe(true);
        expect(getDetailsSpy).toHaveBeenCalledWith({
            connectionId: 'connection-id',
            providerConfigKey: 'github',
            environmentId: 42,
            connection
        });
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'invalid_credentials', status: 424, payload: { reason: 'exhausted' } });
            expect(result.error.connection).not.toHaveProperty('credentials');
        }
    });

    it('retrieves connection details without running the credential refresh path', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(retrievalIntegrationFixture());
        const refresh = vi.fn<typeof refreshOrTestCredentials>();
        const service = new ConnectionService({ configService, refreshOrTestCredentials: refresh });
        vi.spyOn(service, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));

        const result = await service.getConnectionWithoutCredentials({ environmentId: 42, connectionId: 'connection-id', integrationId: 'github' });

        expect(result.isOk()).toBe(true);
        expect(refresh).not.toHaveBeenCalled();
        if (result.isOk()) {
            expect(result.value.credentials).toBeUndefined();
            expect(result.value.connection).not.toHaveProperty('credentials');
        }
    });
});

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

function refreshHooks() {
    return {
        onRefreshSuccess: vi.fn(async () => {}),
        onRefreshFailed: vi.fn(async () => {})
    };
}

function retrievalIntegrationFixture(): Config {
    return {
        id: 2,
        unique_key: 'github',
        provider: 'github',
        environment_id: 42,
        oauth_client_id: '',
        oauth_client_secret: '',
        display_name: null,
        missing_fields: [],
        forward_webhooks: true,
        shared_credentials_id: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z')
    };
}

function connectionWithDetailsFixture(): ConnectionWithDetails {
    return {
        connection: decryptedConnectionFixture(),
        endUser: null,
        activeLogs: [{ type: 'auth', log_id: 'log-id' }],
        provider: 'github'
    };
}

function decryptedConnectionFixture(): DBConnectionDecrypted {
    return {
        id: 1,
        config_id: 2,
        end_user_id: null,
        provider_config_key: 'github',
        connection_id: 'connection-id',
        connection_config: {},
        webhook_url_override: null,
        environment_id: 42,
        metadata: null,
        tags: {},
        credentials_iv: null,
        credentials_tag: null,
        last_fetched_at: new Date('2026-01-03T00:00:00.000Z'),
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
        deleted: false,
        deleted_at: null,
        credentials: {
            type: 'OAUTH2',
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            raw: { token_type: 'bearer', refresh_token: 'raw-refresh-token' }
        }
    };
}
