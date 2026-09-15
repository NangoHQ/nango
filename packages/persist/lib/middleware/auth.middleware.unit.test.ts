import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createInternalServiceToken,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    requireConnectionBoundAuth,
    requireTaskBoundAuth,
    TASK_CAPABILITY_ACTIONS
} from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { authMiddleware } from './auth.middleware.js';
import { connectionOwnershipMiddleware } from './connectionOwnership.middleware.js';

import type * as SharedModule from '@nangohq/shared';

vi.mock('../env.js', () => ({
    envs: { NANGO_INTERNAL_AUTH_SIGNING_KEY: 'sign' }
}));

vi.mock('@nangohq/shared', async () => {
    const actual: typeof SharedModule = await vi.importActual('@nangohq/shared');
    return {
        ...actual,
        accountService: {
            ...actual.accountService,
            getPersistAuthContext: vi.fn(),
            getPersistAuthContextByEnvironmentId: vi.fn()
        },
        connectionService: {
            ...actual.connectionService,
            connectionExistsForEnvironment: vi.fn()
        }
    };
});

const { connectionService } = await import('@nangohq/shared');

function app() {
    const server = express();
    server.use('/environment/:environmentId', authMiddleware);
    server.use('/environment/:environmentId/connection/:nangoConnectionId', requireConnectionBoundAuth());
    server.use('/environment/:environmentId/connection/:nangoConnectionId', connectionOwnershipMiddleware);
    server.put('/environment/:environmentId/runner/task/:taskId/abort', requireTaskBoundAuth(), (_req, res) => {
        res.status(201).end();
    });
    server.post('/environment/:environmentId/log', (_req, res) => {
        res.status(201).end();
    });
    server.post('/environment/:environmentId/connection/:nangoConnectionId/records', (_req, res) => {
        res.status(201).end();
    });
    return server;
}

async function listen(server: ReturnType<typeof express>) {
    return await new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
        const httpServer = server.listen(0, '127.0.0.1', () => {
            const address = httpServer.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((r) => {
                        httpServer.close(() => r());
                    })
            });
        });
    });
}

function persistContext(environmentId: number) {
    return Ok({
        account: { id: 1 },
        environment: { id: environmentId, name: 'dev' },
        plan: { id: 1, name: 'free' as const, records_store: 'default' as const }
    });
}

describe('persist capability token auth', () => {
    afterEach(() => {
        vi.mocked(accountService.getPersistAuthContext).mockReset();
        vi.mocked(accountService.getPersistAuthContextByEnvironmentId).mockReset();
        vi.mocked(connectionService.connectionExistsForEnvironment).mockReset();
    });

    it('accepts a scoped token for the matching environment and connection', async () => {
        vi.mocked(accountService.getPersistAuthContextByEnvironmentId).mockResolvedValue(persistContext(9));
        vi.mocked(connectionService.connectionExistsForEnvironment).mockResolvedValue(true);
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: [TASK_CAPABILITY_ACTIONS.persistRecords],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/connection/42/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(201);
        } finally {
            await close();
        }
    });

    it('rejects a token minted for a different environment', async () => {
        vi.mocked(accountService.getPersistAuthContextByEnvironmentId).mockResolvedValue(persistContext(9));
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: [TASK_CAPABILITY_ACTIONS.persistLog],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/8/log`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a token minted for a different connection', async () => {
        vi.mocked(accountService.getPersistAuthContextByEnvironmentId).mockResolvedValue(persistContext(9));
        vi.mocked(connectionService.connectionExistsForEnvironment).mockResolvedValue(true);
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: [TASK_CAPABILITY_ACTIONS.persistRecords],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/connection/99/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects an expired token', async () => {
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: [TASK_CAPABILITY_ACTIONS.persistLog],
                expiresInSecs: -1
            },
            'sign'
        );
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/log`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
            expect(accountService.getPersistAuthContextByEnvironmentId).not.toHaveBeenCalled();
        } finally {
            await close();
        }
    });

    it('rejects a token missing the required action', async () => {
        vi.mocked(accountService.getPersistAuthContextByEnvironmentId).mockResolvedValue(persistContext(9));
        vi.mocked(connectionService.connectionExistsForEnvironment).mockResolvedValue(true);
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: [TASK_CAPABILITY_ACTIONS.persistLog],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(app());
        try {
            const recordsRes = await fetch(`${url}/environment/9/connection/42/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(recordsRes.status).toBe(401);

            const recordsToken = createInternalServiceToken(
                {
                    taskId: 'task-1',
                    audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                    environmentId: 9,
                    connectionId: 42,
                    actions: [TASK_CAPABILITY_ACTIONS.persistRecords],
                    expiresInSecs: 120
                },
                'sign'
            );
            const logRes = await fetch(`${url}/environment/9/log`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${recordsToken}` }
            });
            expect(logRes.status).toBe(401);
            expect(accountService.getPersistAuthContextByEnvironmentId).not.toHaveBeenCalled();
        } finally {
            await close();
        }
    });

    it('rejects a persist:abort token for a different task', async () => {
        vi.mocked(accountService.getPersistAuthContextByEnvironmentId).mockResolvedValue(persistContext(9));
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                actions: [TASK_CAPABILITY_ACTIONS.persistAbort],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/runner/task/task-2/abort`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('still accepts a secret key', async () => {
        vi.mocked(accountService.getPersistAuthContext).mockResolvedValue(persistContext(9));
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/log`, {
                method: 'POST',
                headers: { Authorization: 'Bearer secret-key' }
            });
            expect(res.status).toBe(201);
        } finally {
            await close();
        }
    });
});
