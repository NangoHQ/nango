import { afterEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { NangoError } from '../utils/error.js';
import configService from './config.service.js';
import { ConnectionCredentialsService } from './connection-credentials.service.js';
import connectionService from './connection.service.js';
import { refreshOrTestCredentials } from './connections/credentials/refresh.js';

import type { Config } from '../models/index.js';
import type { ConnectionWithDetails } from './connection.service.js';
import type { DBConnectionAsJSONRow, DBConnectionDecrypted, DBEnvironment, DBTeam } from '@nangohq/types';

describe('ConnectionCredentialsService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('retrieves connection details and removes OAuth refresh tokens by default', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(integrationFixture());
        const getConnectionSpy = vi
            .spyOn(connectionService, 'getConnection')
            .mockResolvedValue({ success: true, response: decryptedConnectionFixture(), error: null });
        const getDetailsSpy = vi.spyOn(connectionService, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));
        const refresh = vi.fn<typeof refreshOrTestCredentials>().mockResolvedValue(Ok(decryptedConnectionFixture()));

        const service = new ConnectionCredentialsService({ configService, connectionService, refreshOrTestCredentials: refresh });
        const result = await service.get({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'github',
            forceRefresh: true,
            refreshGithubAppJwtToken: true,
            ...refreshHooks()
        });

        expect(getConnectionSpy).toHaveBeenCalledWith('connection-id', 'github', 42);
        expect(getDetailsSpy).toHaveBeenCalledWith({ connectionId: 'connection-id', providerConfigKey: 'github', environmentId: 42 });
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

    it('preserves OAuth refresh tokens when explicitly requested', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(integrationFixture());
        vi.spyOn(connectionService, 'getConnection').mockResolvedValue({ success: true, response: decryptedConnectionFixture(), error: null });
        vi.spyOn(connectionService, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));
        const refresh = vi.fn<typeof refreshOrTestCredentials>().mockResolvedValue(Ok(decryptedConnectionFixture()));

        const service = new ConnectionCredentialsService({ configService, connectionService, refreshOrTestCredentials: refresh });
        const result = await service.get({
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
        const getConnection = vi.spyOn(connectionService, 'getConnection');

        const service = new ConnectionCredentialsService({ configService, connectionService, refreshOrTestCredentials });
        const unknownIntegration = await service.get({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'missing',
            ...refreshHooks()
        });
        expect(unknownIntegration.isErr() && unknownIntegration.error.code).toBe('unknown_provider_config');
        expect(getConnection).not.toHaveBeenCalled();

        getIntegration.mockResolvedValue(integrationFixture());
        getConnection.mockResolvedValue({ success: false, response: null, error: new NangoError('unknown_connection') });
        const unknownConnection = await service.get({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'missing',
            integrationId: 'github',
            ...refreshHooks()
        });
        expect(unknownConnection.isErr() && unknownConnection.error.code).toBe('not_found');
    });

    it('returns invalid credential details with a credential-free enriched connection', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(integrationFixture());
        vi.spyOn(connectionService, 'getConnection').mockResolvedValue({ success: true, response: decryptedConnectionFixture(), error: null });
        vi.spyOn(connectionService, 'getConnectionWithDetails').mockResolvedValue(Ok(connectionWithDetailsFixture()));
        const credentialError = new NangoError('connection_refresh_exhausted', { reason: 'exhausted', connection: { secret: true } }, 424);
        const refresh = vi.fn<typeof refreshOrTestCredentials>().mockResolvedValue(Err(credentialError));

        const service = new ConnectionCredentialsService({ configService, connectionService, refreshOrTestCredentials: refresh });
        const result = await service.get({
            account: {} as DBTeam,
            environment: { id: 42 } as DBEnvironment,
            connectionId: 'connection-id',
            integrationId: 'github',
            ...refreshHooks()
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'invalid_credentials', status: 424, payload: { reason: 'exhausted' } });
            expect(result.error.connection).not.toHaveProperty('credentials');
        }
    });
});

function refreshHooks() {
    return {
        onRefreshSuccess: vi.fn(async () => {}),
        onRefreshFailed: vi.fn(async () => {})
    };
}

function integrationFixture(): Config {
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
        connection: { ...connectionFixture(), credentials: decryptedConnectionFixture().credentials },
        endUser: null,
        activeLogs: [{ type: 'auth', log_id: 'log-id' }],
        provider: 'github'
    };
}

function connectionFixture(): DBConnectionAsJSONRow {
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
        credentials: { encrypted_credentials: 'encrypted' },
        credentials_iv: null,
        credentials_tag: null,
        last_fetched_at: '2026-01-03T00:00:00.000+00:00',
        credentials_expires_at: null,
        last_refresh_failure: null,
        last_refresh_success: null,
        refresh_attempts: null,
        refresh_exhausted: false,
        created_at: '2026-01-01T00:00:00.000+00:00',
        updated_at: '2026-01-02T00:00:00.000+00:00',
        deleted: false,
        deleted_at: null
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
