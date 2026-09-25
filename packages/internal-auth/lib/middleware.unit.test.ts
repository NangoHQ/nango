import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, INTERNAL_SERVICE_AUDIENCE_PERSIST } from './constants.js';
import {
    hasAction,
    internalServiceAuthMiddleware,
    nangoPropsBoundToTaskAuth,
    requireAction,
    requireConnectionBoundAuth,
    requireEnvironmentBoundAuth,
    requireFleetAuth,
    requireTaskBoundAuth
} from './middleware.js';
import { createInternalServiceToken } from './token.js';

import type { InternalServiceAuth } from './constants.js';
import type { InternalAuthEnvs } from './credential.js';

const envs: InternalAuthEnvs = {
    NANGO_INTERNAL_AUTH_REQUIRED: false
};

function app(audience: string) {
    const server = express();
    server.use(internalServiceAuthMiddleware({ audience, envs }));
    server.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    server.post('/v1/dequeue', (_req, res) => {
        res.json({ ok: true });
    });
    server.put('/tasks/:taskId', requireTaskBoundAuth(envs), (_req, res) => {
        res.status(204).end();
    });
    server.post('/runners/:nodeId/register', requireFleetAuth(envs), (_req, res) => {
        res.json({ status: 'ok' });
    });
    return server;
}

/** Mirrors jobs `server.ts`: policy middleware on the parameterized route. */
function jobsMountedApp() {
    const server = express();
    server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_JOBS, envs }));
    server.put('/tasks/:taskId', requireTaskBoundAuth(envs), (_req, res) => {
        res.status(204).end();
    });
    server.post('/tasks/:taskId/heartbeat', requireTaskBoundAuth(envs), (_req, res) => {
        res.status(201).end();
    });
    server.post('/runners/:nodeId/register', requireFleetAuth(envs), (_req, res) => {
        res.json({ status: 'ok' });
    });
    server.post('/runners/:nodeId/idle', requireFleetAuth(envs), (_req, res) => {
        res.json({ status: 'ok' });
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

afterEach(() => {
    envs.NANGO_INTERNAL_AUTH_REQUIRED = false;
    envs.NANGO_INTERNAL_AUTH_TOKEN = undefined;
    envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
    envs.NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY = undefined;
});

describe('internalServiceAuthMiddleware', () => {
    it('allows missing auth when REQUIRED is unset', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = false;
        envs.NANGO_INTERNAL_AUTH_TOKEN = undefined;
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR));
        try {
            const res = await fetch(`${url}/v1/dequeue`, { method: 'POST' });
            expect(res.status).toBe(200);
        } finally {
            await close();
        }
    });

    it('returns 401 for missing auth when REQUIRED is true', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_TOKEN = 'secret';
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR));
        try {
            const res = await fetch(`${url}/v1/dequeue`, { method: 'POST' });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({ error: { code: 'missing_auth_header' } });
        } finally {
            await close();
        }
    });

    it('returns 401 for a malformed header when REQUIRED is true', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_TOKEN = 'secret';
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR));
        try {
            const res = await fetch(`${url}/v1/dequeue`, { method: 'POST', headers: { Authorization: 'secret' } });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({ error: { code: 'malformed_auth_header' } });
        } finally {
            await close();
        }
    });

    it('accepts a matching static bearer when REQUIRED is true', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_TOKEN = 'secret';
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR));
        try {
            const res = await fetch(`${url}/v1/dequeue`, { method: 'POST', headers: { Authorization: 'Bearer secret' } });
            expect(res.status).toBe(200);
        } finally {
            await close();
        }
    });

    it('skips /health when skip matches the path', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const server = express();
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, envs, skip: (req) => req.path === '/health' }));
        server.get('/health', (_req, res) => {
            res.json({ status: 'ok' });
        });
        const { url, close } = await listen(server);
        try {
            const res = await fetch(`${url}/health`);
            expect(res.status).toBe(200);
        } finally {
            await close();
        }
    });

    it('does not protect /health when mounted after it', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const server = express();
        server.get('/health', (_req, res) => {
            res.json({ status: 'ok' });
        });
        server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR, envs }));
        const { url, close } = await listen(server);
        try {
            const res = await fetch(`${url}/health`);
            expect(res.status).toBe(200);
        } finally {
            await close();
        }
    });
});

describe('jobs route policy', () => {
    it('allows missing auth on putTask when REQUIRED is unset', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = false;
        envs.NANGO_INTERNAL_AUTH_TOKEN = undefined;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
        const { url, close } = await listen(jobsMountedApp());
        try {
            const res = await fetch(`${url}/tasks/11111111-1111-4111-8111-111111111111`, { method: 'PUT' });
            expect(res.status).toBe(204);
        } finally {
            await close();
        }
    });

    it('rejects a static token on putTask when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_TOKEN = 'secret';
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/tasks/11111111-1111-4111-8111-111111111111`, {
                method: 'PUT',
                headers: { Authorization: 'Bearer secret' }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('accepts a matching task JWT on putTask when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const taskId = '11111111-1111-4111-8111-111111111111';
        const token = createInternalServiceToken({ taskId, expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(204);
        } finally {
            await close();
        }
    });

    it('rejects an already-expired task JWT', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const taskId = '11111111-1111-4111-8111-111111111111';
        const token = createInternalServiceToken({ taskId, expiresInSecs: -1 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/tasks/${taskId}`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a jobs-audience token on an orchestrator-audience app', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken({ taskId: '11111111-1111-4111-8111-111111111111', expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_ORCHESTRATOR));
        try {
            const res = await fetch(`${url}/v1/dequeue`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a task JWT with the wrong task_id', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken({ taskId: '11111111-1111-4111-8111-111111111111', expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/tasks/22222222-2222-4222-8222-222222222222`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a static token on register when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_TOKEN = 'secret';
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/runners/1/register`, { method: 'POST', headers: { Authorization: 'Bearer secret' } });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('accepts a matching node JWT on register when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken({ op: 'node', nodeId: '1', expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/runners/1/register`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            expect(res.status).toBe(200);
        } finally {
            await close();
        }
    });

    it('rejects a node JWT for the wrong node when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken({ op: 'node', nodeId: '2', expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/runners/1/register`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a node JWT on putTask when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken({ op: 'node', nodeId: '1', expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/tasks/11111111-1111-4111-8111-111111111111`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a task JWT on register when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken({ taskId: '11111111-1111-4111-8111-111111111111', expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(app(INTERNAL_SERVICE_AUDIENCE_JOBS));
        try {
            const res = await fetch(`${url}/runners/1/register`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('accepts a matching task JWT on heartbeat when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const taskId = '11111111-1111-4111-8111-111111111111';
        const token = createInternalServiceToken({ taskId, expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(jobsMountedApp());
        try {
            const res = await fetch(`${url}/tasks/${taskId}/heartbeat`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(201);
        } finally {
            await close();
        }
    });

    it('rejects a static token on idle when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_TOKEN = 'secret';
        const { url, close } = await listen(jobsMountedApp());
        try {
            const res = await fetch(`${url}/runners/1/idle`, { method: 'POST', headers: { Authorization: 'Bearer secret' } });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('accepts a matching node JWT on idle when REQUIRED', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken({ op: 'node', nodeId: '1', expiresInSecs: 120 }, envs.NANGO_INTERNAL_AUTH_SIGNING_KEY);
        const { url, close } = await listen(jobsMountedApp());
        try {
            const res = await fetch(`${url}/runners/1/idle`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            expect(res.status).toBe(200);
        } finally {
            await close();
        }
    });
});

function persistScopedApp() {
    const server = express();
    server.use(internalServiceAuthMiddleware({ audience: INTERNAL_SERVICE_AUDIENCE_PERSIST, envs }));
    server.use('/environment/:environmentId', requireEnvironmentBoundAuth());
    server.use('/environment/:environmentId/connection/:nangoConnectionId', requireConnectionBoundAuth());
    server.post('/environment/:environmentId/log', requireAction('persist:log'), (_req, res) => {
        res.status(201).end();
    });
    server.post('/environment/:environmentId/connection/:nangoConnectionId/records', requireAction('persist:records'), (_req, res) => {
        res.status(201).end();
    });
    return server;
}

describe('capability scope policy', () => {
    it('allows a matching environment, connection, and action', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: ['persist:records'],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(persistScopedApp());
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
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: ['persist:log'],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(persistScopedApp());
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
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: ['persist:records'],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(persistScopedApp());
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

    it('rejects a token missing the required action', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                environmentId: 9,
                connectionId: 42,
                actions: ['persist:log'],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(persistScopedApp());
        try {
            const res = await fetch(`${url}/environment/9/connection/42/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a node token even when it carries an actions claim', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = 'sign';
        const token = createInternalServiceToken(
            {
                op: 'node',
                nodeId: '1',
                audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                actions: ['persist:log'],
                expiresInSecs: 120
            },
            'sign'
        );
        const { url, close } = await listen(persistScopedApp());
        try {
            const res = await fetch(`${url}/environment/9/log`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('lets a static credential through capability guards', async () => {
        envs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        envs.NANGO_INTERNAL_AUTH_TOKEN = 'secret';
        const { url, close } = await listen(persistScopedApp());
        try {
            const res = await fetch(`${url}/environment/9/log`, {
                method: 'POST',
                headers: { Authorization: 'Bearer secret' }
            });
            expect(res.status).toBe(201);
        } finally {
            await close();
        }
    });
});

describe('nangoPropsBoundToTaskAuth', () => {
    const ownProps = { environmentId: 7, nangoConnectionId: 11, syncId: '11111111-1111-4111-8111-111111111111' };
    const victimProps = { environmentId: 42, nangoConnectionId: 9001, syncId: '22222222-2222-4222-8222-222222222222' };
    const signedTask = (overrides: Partial<InternalServiceAuth> = {}): InternalServiceAuth => ({
        kind: 'hmac',
        subject: 'nango-internal',
        audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
        op: 'task',
        taskId: '11111111-1111-4111-8111-111111111111',
        environmentId: 7,
        connectionId: 11,
        syncId: ownProps.syncId,
        ...overrides
    });

    it('allows unsigned callers so REQUIRED=false self-host stays a no-op', () => {
        expect(nangoPropsBoundToTaskAuth(undefined, victimProps)).toBe(true);
        expect(nangoPropsBoundToTaskAuth({ kind: 'static', subject: 'nango-internal', audience: INTERNAL_SERVICE_AUDIENCE_JOBS }, victimProps)).toBe(true);
    });

    it('accepts nangoProps that match the signed task claims', () => {
        expect(nangoPropsBoundToTaskAuth(signedTask(), ownProps)).toBe(true);
    });

    it('rejects a body that names another environment, connection, or sync', () => {
        expect(nangoPropsBoundToTaskAuth(signedTask(), victimProps)).toBe(false);
        expect(nangoPropsBoundToTaskAuth(signedTask(), { ...ownProps, environmentId: 42 })).toBe(false);
        expect(nangoPropsBoundToTaskAuth(signedTask(), { ...ownProps, nangoConnectionId: 9001 })).toBe(false);
        expect(nangoPropsBoundToTaskAuth(signedTask(), { ...ownProps, syncId: victimProps.syncId })).toBe(false);
    });

    it('fails closed when a signed task token omits environment or connection claims', () => {
        const { environmentId: _environmentId, connectionId: _connectionId, syncId: _syncId, ...noScope } = signedTask();
        expect(nangoPropsBoundToTaskAuth(noScope, ownProps)).toBe(false);
        const { environmentId, ...noEnv } = signedTask();
        expect(environmentId).toBe(7);
        expect(nangoPropsBoundToTaskAuth(noEnv, ownProps)).toBe(false);
        const { connectionId, ...noConnection } = signedTask();
        expect(connectionId).toBe(11);
        expect(nangoPropsBoundToTaskAuth(noConnection, ownProps)).toBe(false);
    });

    it('rejects an action token that adds a syncId the JWT never claimed', () => {
        const { syncId: _syncId, ...actionAuth } = signedTask();
        expect(nangoPropsBoundToTaskAuth(actionAuth, { ...ownProps, syncId: victimProps.syncId })).toBe(false);
        expect(nangoPropsBoundToTaskAuth(actionAuth, { environmentId: 7, nangoConnectionId: 11 })).toBe(true);
    });

    it('rejects a node-bound token', () => {
        expect(
            nangoPropsBoundToTaskAuth(
                {
                    kind: 'hmac',
                    subject: 'nango-internal',
                    audience: INTERNAL_SERVICE_AUDIENCE_JOBS,
                    op: 'node',
                    nodeId: '1',
                    environmentId: 7,
                    connectionId: 11
                },
                { environmentId: 7, nangoConnectionId: 11 }
            )
        ).toBe(false);
    });
});

describe('hasAction', () => {
    it('is true only for a signed task token that lists the action', () => {
        const task: InternalServiceAuth = {
            kind: 'hmac',
            subject: 'nango-internal',
            audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
            op: 'task',
            taskId: 'task-1',
            actions: ['persist:log']
        };
        expect(hasAction(task, 'persist:log')).toBe(true);
        expect(hasAction(task, 'persist:records')).toBe(false);
        expect(
            hasAction(
                {
                    kind: 'hmac',
                    subject: 'nango-internal',
                    audience: INTERNAL_SERVICE_AUDIENCE_PERSIST,
                    op: 'node',
                    nodeId: '1',
                    actions: ['persist:log']
                },
                'persist:log'
            )
        ).toBe(false);
    });
});
