import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import appAuthController from './appAuth.controller.js';

import type * as DatabaseModule from '@nangohq/database';
import type * as SharedModule from '@nangohq/shared';
import type { Request, Response } from 'express';

const {
    mockFindById,
    mockSessionDelete,
    mockGetAccountContext,
    mockGetProviderConfig,
    mockGetProvider,
    mockCreateCredentials,
    mockGetConnectSession,
    mockGenerateConnectionId,
    mockUpsertConnection,
    mockConnectionCreated,
    mockConnectionCreationFailed,
    mockLogCtx
} = vi.hoisted(() => {
    return {
        mockFindById: vi.fn(),
        mockSessionDelete: vi.fn(),
        mockGetAccountContext: vi.fn(),
        mockGetProviderConfig: vi.fn(),
        mockGetProvider: vi.fn(),
        mockCreateCredentials: vi.fn(),
        mockGetConnectSession: vi.fn(),
        mockGenerateConnectionId: vi.fn(),
        mockUpsertConnection: vi.fn(),
        mockConnectionCreated: vi.fn(),
        mockConnectionCreationFailed: vi.fn(),
        mockLogCtx: {
            error: vi.fn(),
            failed: vi.fn(),
            success: vi.fn(),
            info: vi.fn(),
            enrichOperation: vi.fn()
        }
    };
});

vi.mock('@nangohq/database', async () => {
    const actual: typeof DatabaseModule = await vi.importActual('@nangohq/database');
    return { ...actual, default: { knex: {} } };
});

vi.mock('@nangohq/logs', () => ({
    logContextGetter: { get: vi.fn(() => mockLogCtx) }
}));

vi.mock('@nangohq/shared', async () => {
    const actual: typeof SharedModule = await vi.importActual('@nangohq/shared');
    return {
        ...actual,
        accountService: { getAccountContext: mockGetAccountContext },
        configService: { getProviderConfig: mockGetProviderConfig },
        connectionService: {
            generateConnectionId: mockGenerateConnectionId,
            upsertConnection: mockUpsertConnection
        },
        errorManager: { errRes: vi.fn() },
        getProvider: mockGetProvider,
        githubAppClient: { createCredentials: mockCreateCredentials },
        syncEndUserToConnection: vi.fn()
    };
});

vi.mock('../clients/publisher.client.js', () => ({
    default: { notifySuccess: vi.fn(), notifyErr: vi.fn() }
}));

vi.mock('../hooks/hooks.js', () => ({
    connectionCreated: mockConnectionCreated,
    connectionCreationFailed: mockConnectionCreationFailed
}));

vi.mock('../services/connectSession.service.js', () => ({
    getConnectSession: mockGetConnectSession
}));

vi.mock('../services/oauth-session.service.js', () => ({
    default: { findById: mockFindById, delete: mockSessionDelete }
}));

describe('AppAuthController.connect', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockFindById.mockResolvedValue({
            id: 'session-id',
            environmentId: 2,
            providerConfigKey: 'github-app',
            connectionId: 'conn-1',
            webSocketClientId: undefined,
            activityLogId: 'activity-1',
            connectSessionId: 10
        });
        mockGetAccountContext.mockResolvedValue({ environment: { id: 2, name: 'dev' }, account: { id: 1, name: 'acme' } });
        mockGetProviderConfig.mockResolvedValue({ id: 1, unique_key: 'github-app', provider: 'github-app', oauth_client_id: 'app-123' });
        mockGetProvider.mockReturnValue({ auth_mode: 'APP', token_url: 'https://api.github.com/app/installations' });
        mockCreateCredentials.mockResolvedValue(Ok({ type: 'APP', jwtToken: 'jwt-token' }));
        mockGenerateConnectionId.mockReturnValue('generated-connection-id');
        mockGetConnectSession.mockResolvedValue(
            Ok({
                connectSession: {
                    tags: {},
                    endUser: null,
                    webhookUrlOverride: 'https://override.example.com/hook'
                }
            })
        );
        mockUpsertConnection.mockResolvedValue([{ connection: { id: 1, connection_id: 'conn-1', provider_config_key: 'github-app' }, operation: 'creation' }]);
    });

    it('stores the connect session webhook URL override as webhook_url_override (not connection_config)', async () => {
        const req = {
            query: { installation_id: 'install-1', state: 'session-id' }
        } as unknown as Request;
        const res = { redirect: vi.fn(), sendStatus: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as unknown as Response;
        const next = vi.fn();

        await appAuthController.connect(req, res, next);

        expect(mockUpsertConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                webhookUrlOverride: 'https://override.example.com/hook',
                connectionConfig: expect.objectContaining({
                    installation_id: 'install-1',
                    app_id: 'app-123',
                    jwtToken: 'jwt-token'
                })
            })
        );
        expect(mockUpsertConnection).toHaveBeenCalledWith(
            expect.objectContaining({ connectionConfig: expect.not.objectContaining({ webhook_url: expect.anything() }) })
        );
    });

    it('threads the per-connection webhook URL override into the creation-failure hook', async () => {
        mockUpsertConnection.mockRejectedValue(new Error('boom'));

        const req = {
            query: { installation_id: 'install-1', state: 'session-id' }
        } as unknown as Request;
        const res = { redirect: vi.fn(), sendStatus: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as unknown as Response;
        const next = vi.fn();

        await appAuthController.connect(req, res, next);

        expect(mockConnectionCreationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                connection: expect.objectContaining({
                    webhook_url_override: 'https://override.example.com/hook'
                })
            }),
            expect.anything()
        );
    });
});
