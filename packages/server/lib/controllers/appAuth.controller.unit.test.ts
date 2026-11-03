import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionCreationCappedError } from '@nangohq/shared';
import { basePublicUrl, Ok } from '@nangohq/utils';

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
    mockGetConnection,
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
        mockGetConnection: vi.fn(),
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
            getConnection: mockGetConnection,
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
            connectSessionId: 10,
            connectionConfig: {}
        });
        mockGetAccountContext.mockResolvedValue({
            environment: { id: 2, uuid: 'e0000000-0000-4000-8000-000000000002', name: 'dev' },
            account: { id: 1, uuid: 'a0000000-0000-4000-8000-000000000001', name: 'acme' }
        });
        mockGetProviderConfig.mockResolvedValue({ id: 1, unique_key: 'github-app', provider: 'github-app', oauth_client_id: 'app-123' });
        mockGetProvider.mockReturnValue({ auth_mode: 'APP', token_url: 'https://api.github.com/app/installations' });
        mockCreateCredentials.mockResolvedValue(Ok({ type: 'APP', jwtToken: 'jwt-token' }));
        mockGenerateConnectionId.mockReturnValue('generated-connection-id');
        mockGetConnection.mockResolvedValue({ success: false, error: new Error('unknown_connection'), response: null });
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
            query: { installation_id: 'install-1', state: 'session-id' },
            ip: '203.0.113.7',
            get: vi.fn(() => 'vitest')
        } as unknown as Request;
        const res = {
            locals: {},
            redirect: vi.fn(),
            sendStatus: vi.fn(),
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
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
        // The route middleware records the event, so what this handler owes it is the upsert outcome and
        // the account it happened to — an unauthenticated callback carries neither on its locals.
        expect(req.audit?.connectionUpsert).toMatchObject({
            operation: 'creation',
            connectionId: 'conn-1',
            providerConfigKey: 'github-app',
            account: { id: 1 },
            environment: { uuid: 'e0000000-0000-4000-8000-000000000002', name: 'dev' }
        });
    });

    it('threads the per-connection webhook URL override into the creation-failure hook', async () => {
        mockUpsertConnection.mockRejectedValue(new Error('boom'));

        const req = {
            query: { installation_id: 'install-1', state: 'session-id' },
            ip: '203.0.113.7',
            get: vi.fn(() => 'vitest')
        } as unknown as Request;
        const res = {
            locals: {},
            redirect: vi.fn(),
            sendStatus: vi.fn(),
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
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

    it('triggers the creation-failure hook when connection creation is capped', async () => {
        mockUpsertConnection.mockRejectedValue(new ConnectionCreationCappedError());

        const req = {
            query: { installation_id: 'install-1', state: 'session-id' },
            ip: '203.0.113.7',
            get: vi.fn(() => 'vitest')
        } as unknown as Request;
        const res = {
            locals: {},
            redirect: vi.fn(),
            sendStatus: vi.fn(),
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;

        await appAuthController.connect(req, res, vi.fn());

        expect(mockConnectionCreationFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                error: {
                    type: 'resource_capped',
                    description: 'Reached maximum number of allowed connections. Upgrade your plan to get rid of connection limits.'
                }
            }),
            expect.anything()
        );
    });

    it.each(['install', 'update'])(
        'redirects to a fixed internal URL, ignoring an attacker-controlled Referer, when %s completes without state',
        async (setupAction) => {
            const redirect = vi.fn();
            const req = {
                query: { installation_id: 'install-1', setup_action: setupAction },
                ip: '203.0.113.7',
                get: vi.fn((header: string) => (header.toLowerCase() === 'referer' ? 'https://evil.example.com/phish' : undefined)),
                headers: { referer: 'https://evil.example.com/phish' }
            } as unknown as Request;
            const res = {
                locals: {},
                redirect,
                sendStatus: vi.fn(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn().mockReturnThis()
            } as unknown as Response;
            const next = vi.fn();

            await appAuthController.connect(req, res, next);

            expect(redirect).toHaveBeenCalledWith(basePublicUrl);
            expect(redirect).not.toHaveBeenCalledWith(expect.stringContaining('evil.example.com'));
            expect(mockFindById).not.toHaveBeenCalled();
        }
    );

    const buildReqRes = () => {
        const req = {
            query: { installation_id: 'install-1', state: 'session-id' },
            ip: '203.0.113.7',
            get: vi.fn(() => 'vitest')
        } as unknown as Request;
        const res = {
            locals: {},
            redirect: vi.fn(),
            sendStatus: vi.fn(),
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis()
        } as unknown as Response;
        return { req, res };
    };

    it('uses the app credentials the end user entered and keeps them out of connection_config', async () => {
        const privateKey = Buffer.from('-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----').toString('base64');
        const appLink = 'https://github.com/apps/override';
        mockFindById.mockResolvedValue({
            id: 'session-id',
            environmentId: 2,
            providerConfigKey: 'github-app',
            connectionId: 'conn-1',
            webSocketClientId: undefined,
            activityLogId: 'activity-1',
            connectSessionId: 10,
            connectionConfig: {
                app_id_override: 'override-app',
                private_key_override: privateKey,
                app_link_override: appLink,
                webhook_secret_override: 'whsec'
            }
        });

        const { req, res } = buildReqRes();
        await appAuthController.connect(req, res, vi.fn());

        expect(mockCreateCredentials).toHaveBeenCalledWith(
            expect.objectContaining({
                override: { app_id: 'override-app', private_key: privateKey, app_link: appLink, webhook_secret: 'whsec' },
                connectionConfig: expect.objectContaining({ app_id: 'override-app', installation_id: 'install-1' })
            })
        );

        const saved = mockUpsertConnection.mock.calls[0]?.[0] as { connectionConfig: Record<string, unknown> };
        expect(saved.connectionConfig['app_id']).toBe('override-app');
        expect(saved.connectionConfig).not.toHaveProperty('app_id_override');
        expect(saved.connectionConfig).not.toHaveProperty('private_key_override');
        expect(saved.connectionConfig).not.toHaveProperty('app_link_override');
        expect(saved.connectionConfig).not.toHaveProperty('webhook_secret_override');
    });

    it('falls back to the integration app when nothing was entered and the connection has no stored app', async () => {
        const { req, res } = buildReqRes();
        await appAuthController.connect(req, res, vi.fn());

        const args = mockCreateCredentials.mock.calls[0]?.[0] as { override?: unknown; connection?: unknown; connectionConfig: Record<string, unknown> };
        expect(args.override).toBeUndefined();
        expect(args.connection).toBeUndefined();
        expect(args.connectionConfig['app_id']).toBe('app-123');
    });

    it('reuses the app stored on the existing connection on reconnect', async () => {
        const storedOverride = { app_id: 'stored-app', private_key: 'c3RvcmVk', app_link: 'https://github.com/apps/stored', webhook_secret: 'stored-secret' };
        const existing = { connection_id: 'conn-1', credentials: { type: 'APP', config_override: storedOverride } };
        mockGetConnection.mockResolvedValue({ success: true, error: null, response: existing });

        const { req, res } = buildReqRes();
        await appAuthController.connect(req, res, vi.fn());

        expect(mockGetConnection).toHaveBeenCalledWith('conn-1', 'github-app', 2);
        const args = mockCreateCredentials.mock.calls[0]?.[0] as { override?: unknown; connection?: unknown };
        expect(args.override).toBeUndefined();
        expect(args.connection).toBe(existing);

        const saved = mockUpsertConnection.mock.calls[0]?.[0] as { connectionConfig: Record<string, unknown> };
        expect(saved.connectionConfig['app_id']).toBe('stored-app');
    });
});
