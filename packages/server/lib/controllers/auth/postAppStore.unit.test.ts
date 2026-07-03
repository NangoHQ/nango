import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { postPublicAppStoreAuthorization } from './postAppStore.js';

import type * as DatabaseModule from '@nangohq/database';
import type * as SharedModule from '@nangohq/shared';
import type { Request, Response } from 'express';

const {
    mockCreateLogContext,
    mockGenerateConnectionId,
    mockGetProviderConfig,
    mockGetProvider,
    mockCreateCredentials,
    mockUpsertConnection,
    mockHmacCheck,
    mockValidateConnection,
    mockConnectionCreated,
    mockConnectionCreationFailed
} = vi.hoisted(() => {
    return {
        mockCreateLogContext: vi.fn(),
        mockGenerateConnectionId: vi.fn(),
        mockGetProviderConfig: vi.fn(),
        mockGetProvider: vi.fn(),
        mockCreateCredentials: vi.fn(),
        mockUpsertConnection: vi.fn(),
        mockHmacCheck: vi.fn(),
        mockValidateConnection: vi.fn(),
        mockConnectionCreated: vi.fn(),
        mockConnectionCreationFailed: vi.fn()
    };
});

vi.mock('@nangohq/database', async () => {
    const actual: typeof DatabaseModule = await vi.importActual('@nangohq/database');
    return { ...actual, default: { knex: {} } };
});

vi.mock('@nangohq/logs', () => ({
    defaultOperationExpiration: { auth: () => new Date('2026-01-01T00:00:00.000Z') },
    endUserToMeta: vi.fn(() => null),
    logContextGetter: { create: mockCreateLogContext, get: vi.fn() }
}));

vi.mock('@nangohq/shared', async () => {
    const actual: typeof SharedModule = await vi.importActual('@nangohq/shared');
    return {
        ...actual,
        ErrorSourceEnum: { PLATFORM: 'platform' },
        LogActionEnum: { AUTH: 'auth' },
        errorManager: { report: vi.fn() },
        appleAppStoreClient: { createCredentials: mockCreateCredentials },
        configService: { getProviderConfig: mockGetProviderConfig },
        connectionService: {
            generateConnectionId: mockGenerateConnectionId,
            getConnectionById: vi.fn(),
            upsertConnection: mockUpsertConnection
        },
        getProvider: mockGetProvider,
        syncEndUserToConnection: vi.fn()
    };
});

vi.mock('../../hooks/connection/on/validate-connection.js', () => ({
    validateConnection: mockValidateConnection
}));

vi.mock('../../hooks/hooks.js', () => ({
    connectionCreated: mockConnectionCreated,
    connectionCreationFailed: mockConnectionCreationFailed
}));

vi.mock('../../utils/hmac.js', () => ({
    hmacCheck: mockHmacCheck
}));

describe('postPublicAppStoreAuthorization', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockCreateLogContext.mockResolvedValue({
            error: vi.fn(),
            failed: vi.fn(),
            enrichOperation: vi.fn(),
            warn: vi.fn(),
            log: vi.fn(),
            info: vi.fn(),
            success: vi.fn()
        });
        mockGenerateConnectionId.mockReturnValue('generated-connection-id');
        mockGetProviderConfig.mockResolvedValue({ id: 1, unique_key: 'appstore', provider: 'apple-app-store' });
        mockGetProvider.mockReturnValue({ auth_mode: 'APP_STORE' });
        mockCreateCredentials.mockResolvedValue(Ok({ type: 'APP_STORE' }));
        mockUpsertConnection.mockResolvedValue([
            { connection: { id: 1, connection_id: 'generated-connection-id', provider_config_key: 'appstore' }, operation: 'creation' }
        ]);
        mockHmacCheck.mockResolvedValue(true);
        mockValidateConnection.mockResolvedValue(Ok({ tested: true }));
    });

    // The override is only honored from the backend-set connect session default, never from client params,
    // and is resolved by the real resolveConnectionConfig (not mocked).
    const connectSessionWithOverride = {
        operationId: null,
        connectionId: null,
        allowedIntegrations: null,
        integrationsConfigDefaults: { appstore: { connectionConfig: { webhook_url: 'https://override.example.com/hook' } } }
    };
    const sessionTokenQuery = { connect_session_token: `nango_connect_session_${'a'.repeat(64)}` };

    it('stores the resolved per-connection webhook URL override alongside the App Store connection config', async () => {
        const req = {
            body: { privateKeyId: 'key-id', privateKey: 'private-key', issuerId: 'issuer-id' },
            query: sessionTokenQuery,
            params: { providerConfigKey: 'appstore' }
        } as unknown as Request;

        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = {
            locals: {
                account: { id: 1 },
                environment: { id: 2 },
                connectSession: connectSessionWithOverride,
                authType: 'connectSession',
                endUser: null
            },
            status,
            send
        } as unknown as Response;
        const next = vi.fn();

        await postPublicAppStoreAuthorization(req, res, next);

        expect(mockUpsertConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionConfig: expect.objectContaining({
                    webhook_url: 'https://override.example.com/hook',
                    privateKeyId: 'key-id',
                    issuerId: 'issuer-id'
                })
            })
        );
    });

    it('ignores a client-supplied webhook_url param', async () => {
        const req = {
            body: { privateKeyId: 'key-id', privateKey: 'private-key', issuerId: 'issuer-id' },
            query: { public_key: '550e8400-e29b-41d4-a716-446655440000', params: { webhook_url: 'https://attacker.example.com/hook' } },
            params: { providerConfigKey: 'appstore' }
        } as unknown as Request;

        const res = {
            locals: { account: { id: 1 }, environment: { id: 2 }, connectSession: null, authType: 'publicKey', endUser: null },
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        const next = vi.fn();

        await postPublicAppStoreAuthorization(req, res, next);

        expect(mockUpsertConnection).toHaveBeenCalledWith(
            expect.objectContaining({ connectionConfig: expect.not.objectContaining({ webhook_url: expect.anything() }) })
        );
    });

    it('threads the per-connection webhook URL override into the creation-failure hook', async () => {
        mockUpsertConnection.mockRejectedValue(new Error('boom'));

        const req = {
            body: { privateKeyId: 'key-id', privateKey: 'private-key', issuerId: 'issuer-id' },
            query: sessionTokenQuery,
            params: { providerConfigKey: 'appstore' }
        } as unknown as Request;

        const res = {
            locals: { account: { id: 1 }, environment: { id: 2 }, connectSession: connectSessionWithOverride, authType: 'connectSession', endUser: null },
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        const next = vi.fn();

        await postPublicAppStoreAuthorization(req, res, next);

        expect(mockConnectionCreationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                connection: expect.objectContaining({
                    connection_config: expect.objectContaining({ webhook_url: 'https://override.example.com/hook' })
                })
            }),
            expect.anything()
        );
    });
});
