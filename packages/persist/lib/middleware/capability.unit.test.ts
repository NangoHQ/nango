import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUDIENCE_SERVER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    keyRegistryFromPublicKeys,
    mint,
    taskSubject
} from '@nangohq/internal-auth';
import { ed25519TestMaterial, mintTaskCapabilityToken } from '@nangohq/internal-auth/testing';
import { accountService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { authenticate, authorize, authorizeBodySyncId } from './capability.js';

import type { TaskCapabilityScope } from '@nangohq/internal-auth';
import type { PersistAuthContext } from '@nangohq/types';
import type { Express } from 'express';

const material = ed25519TestMaterial();
process.env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS'] = JSON.stringify([{ kid: 'jobs-2026-09', publicKey: material.raw }]);

const { server } = await import('../server.js');

const context: PersistAuthContext = {
    account: { id: 1 },
    environment: { id: 9, name: 'dev' },
    plan: null
};

const resource = { environmentId: 9, connectionId: 1, syncId: 'sync-a' };

function hs256Secret(): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'customer' })).toString('base64url');
    return `${header}.${payload}.sig`;
}

async function listen(app: Express): Promise<{ url: string; close: () => Promise<void> }> {
    return await new Promise((resolve) => {
        const httpServer = app.listen(0, '127.0.0.1', () => {
            const address = httpServer.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise((done) => {
                        httpServer.close(() => done());
                    })
            });
        });
    });
}

async function token(scopes: readonly string[], res: typeof resource = resource, taskId = 'task-1'): Promise<string> {
    return await mintTaskCapabilityToken({
        privateKey: material.pem,
        taskId,
        res,
        scopes: scopes as Parameters<typeof mintTaskCapabilityToken>[0]['scopes']
    });
}

const logBody = {
    activityLogId: 'a'.repeat(22),
    log: { type: 'log', level: 'info', message: 'hello', createdAt: new Date().toISOString() }
};

describe('persist task capability', () => {
    let url: string;
    let close: () => Promise<void>;
    const secretLookup = vi.spyOn(accountService, 'getPersistAuthContext');
    const environmentLookup = vi.spyOn(accountService, 'getPersistAuthContextByEnvironmentId');

    beforeAll(async () => {
        secretLookup.mockImplementation((key) => {
            if (key === 'secret-key') {
                return Promise.resolve(Ok(context));
            }
            return Promise.resolve(Ok(null));
        });
        environmentLookup.mockImplementation((environmentId) => {
            if (environmentId === 9) {
                return Promise.resolve(Ok(context));
            }
            return Promise.resolve(Ok(null));
        });
        ({ url, close } = await listen(server));
    });

    afterAll(async () => {
        secretLookup.mockRestore();
        environmentLookup.mockRestore();
        await close();
    });

    beforeEach(() => {
        secretLookup.mockClear();
        environmentLookup.mockClear();
    });

    it('every route is authenticated, and a matching task token is not rejected as unauthorized', async () => {
        const routes = registeredRoutes();
        expect(routes).toHaveLength(21);

        const syncId = '11111111-1111-4111-8111-111111111111';
        const otherSyncId = '22222222-2222-4222-8222-222222222222';
        const values = { environmentId: '9', nangoConnectionId: '1', syncId, syncJobId: '1', taskId: 'task-1' };

        for (const route of routes) {
            if (route.path === '/health') {
                const open = await fetch(`${url}/health`);
                expect(open.status).toBe(200);
                const bearer = await token(['persist:log']);
                const rejected = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${bearer}` } });
                expect(rejected.status).toBe(401);
                expect(await rejected.json()).toMatchObject({ error: { code: 'unauthorized' } });
                continue;
            }

            const scope = scopeFor(route.path);
            const filled = `${url}${fillPath(route.path, values)}`;
            const missing = await fetch(filled, { method: route.method });
            expect(missing.status).toBe(401);
            // A missing header is rejected by the secret-key path, which keeps its own code.
            expect(await missing.json()).toMatchObject({ error: { code: 'missing_auth_header' } });

            const validResource = { ...resource, syncId };
            const wrongScope = await token([scope === 'persist:log' ? 'persist:records' : 'persist:log'], validResource);
            const scoped = await fetch(filled, { method: route.method, headers: { Authorization: `Bearer ${wrongScope}` } });
            expect(scoped.status).toBe(401);
            expect(await scoped.json()).toMatchObject({ error: { code: 'unauthorized' } });

            const bound = await token([scope], validResource);
            const environment = await fetch(`${url}${fillPath(route.path, { ...values, environmentId: '10' })}`, {
                method: route.method,
                headers: { Authorization: `Bearer ${bound}` }
            });
            expect(environment.status).toBe(401);
            expect(await environment.json()).toMatchObject({ error: { code: 'unauthorized' } });

            if (route.path.includes(':nangoConnectionId')) {
                const otherConnection = await token([scope], { ...validResource, connectionId: 2 });
                const connection = await fetch(filled, { method: route.method, headers: { Authorization: `Bearer ${otherConnection}` } });
                expect(connection.status).toBe(401);
                expect(await connection.json()).toMatchObject({ error: { code: 'unauthorized' } });
            }
            if (route.path.includes(':syncId')) {
                const otherSync = await token([scope], { ...validResource, syncId: otherSyncId });
                const sync = await fetch(filled, { method: route.method, headers: { Authorization: `Bearer ${otherSync}` } });
                expect(sync.status).toBe(401);
                expect(await sync.json()).toMatchObject({ error: { code: 'unauthorized' } });
            }
            if (route.path.includes(':taskId')) {
                const otherTask = await token([scope], validResource, 'task-2');
                const task = await fetch(filled, { method: route.method, headers: { Authorization: `Bearer ${otherTask}` } });
                expect(task.status).toBe(401);
                expect(await task.json()).toMatchObject({ error: { code: 'unauthorized' } });
            }

            const accepted = await fetch(filled, {
                method: route.method,
                headers: { Authorization: `Bearer ${bound}`, 'Content-Type': 'application/json' },
                ...(route.path.includes('sync-conflict') ? { body: JSON.stringify({ scriptType: 'sync', syncId, ttlMs: 1000 }) } : {})
            });
            if (accepted.status === 401) {
                expect(await accepted.json()).not.toMatchObject({ error: { code: 'unauthorized' } });
            }

            if (route.path.includes('sync-conflict')) {
                const mismatch = await fetch(filled, {
                    method: route.method,
                    headers: { Authorization: `Bearer ${bound}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scriptType: 'sync', syncId: otherSyncId, ttlMs: 1000 })
                });
                expect(mismatch.status).toBe(401);
                expect(await mismatch.json()).toMatchObject({ error: { code: 'unauthorized' } });
            }
        }
    });

    it('T5: a token for connection 1 gets a 401 on connection 2 records', async () => {
        const bearer = await token(['persist:records']);
        const res = await fetch(`${url}/environment/9/connection/2/records`, { headers: { Authorization: `Bearer ${bearer}` } });
        expect(res.status).toBe(401);
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('T6: a token for sync A gets a 401 on sync B in the path and in the sync-conflict body', async () => {
        const bearer = await token(['persist:records', 'persist:sync-conflict']);
        const path = await fetch(`${url}/environment/9/connection/1/sync/sync-b/job/1/records`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}` }
        });
        expect(path.status).toBe(401);

        const body = await fetch(`${url}/environment/9/runner/sync-conflict`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ scriptType: 'sync', syncId: 'sync-b', ttlMs: 1000 })
        });
        expect(body.status).toBe(401);
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('T7: a token with only persist:log gets a 401 on a records route', async () => {
        const bearer = await token(['persist:log']);
        const res = await fetch(`${url}/environment/9/connection/1/records`, { headers: { Authorization: `Bearer ${bearer}` } });
        expect(res.status).toBe(401);
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('a route without authorize still requires a credential but does not check scope', async () => {
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: material.raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const app = express();
        app.use('/environment/:environmentId', authenticate(registry));
        app.get('/environment/:environmentId/unscoped', (_req, res) => {
            res.status(204).end();
        });
        const { url: bareUrl, close: closeBare } = await listen(app);
        try {
            const bearer = await token(['persist:log']);
            const missing = await fetch(`${bareUrl}/environment/9/unscoped`);
            expect(missing.status).toBe(401);

            const withToken = await fetch(`${bareUrl}/environment/9/unscoped`, { headers: { Authorization: `Bearer ${bearer}` } });
            expect(withToken.status).toBe(204);
            expect(secretLookup).not.toHaveBeenCalled();

            const withSecret = await fetch(`${bareUrl}/environment/9/unscoped`, { headers: { Authorization: 'Bearer secret-key' } });
            expect(withSecret.status).toBe(204);
            expect(secretLookup).toHaveBeenCalledWith('secret-key');
        } finally {
            await closeBare();
        }
    });

    it('T9: a token for environment 9 gets a 401 on environment 10', async () => {
        const bearer = await token(['persist:log']);
        const res = await fetch(`${url}/environment/10/log`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(logBody)
        });
        expect(res.status).toBe(401);
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('accepts a matching persist:log token and loads the environment from the claim', async () => {
        const bearer = await token(['persist:log']);
        const res = await fetch(`${url}/environment/9/log`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(logBody)
        });
        expect(res.status).toBe(204);
        expect(environmentLookup).toHaveBeenCalledWith(9);
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('accepts a lowercase bearer scheme on an EdDSA task JWT', async () => {
        const bearer = await token(['persist:log']);
        const res = await fetch(`${url}/environment/9/log`, {
            method: 'POST',
            headers: { Authorization: `bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(logBody)
        });
        expect(res.status).toBe(204);
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('a token for task-1 gets a 401 on task-2 abort', async () => {
        const bearer = await token(['persist:abort']);
        const res = await fetch(`${url}/environment/9/runner/task/task-2/abort`, { headers: { Authorization: `Bearer ${bearer}` } });
        expect(res.status).toBe(401);
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('rejects an EdDSA task JWT that has no scopes claim', async () => {
        const bearer = await mint(
            { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: material.pem },
            {
                sub: taskSubject('task-1'),
                aud: [INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_PERSIST, INTERNAL_SERVICE_AUDIENCE_SERVER],
                ttlSecs: 60,
                res: resource
            }
        );
        const res = await fetch(`${url}/environment/9/log`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(logBody)
        });
        expect(res.status).toBe(401);
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('T10: the secret-key path is unchanged, including a three-part non-EdDSA secret', async () => {
        const ok = await fetch(`${url}/environment/9/log`, {
            method: 'POST',
            headers: { Authorization: 'Bearer secret-key', 'Content-Type': 'application/json' },
            body: JSON.stringify(logBody)
        });
        expect(ok.status).toBe(204);
        expect(secretLookup).toHaveBeenCalledWith('secret-key');
        expect(environmentLookup).not.toHaveBeenCalled();

        secretLookup.mockClear();
        const wrong = await fetch(`${url}/environment/9/log`, {
            method: 'POST',
            headers: { Authorization: 'Bearer wrong-secret', 'Content-Type': 'application/json' },
            body: JSON.stringify(logBody)
        });
        expect(wrong.status).toBe(401);
        expect(secretLookup).toHaveBeenCalledWith('wrong-secret');

        secretLookup.mockClear();
        const jwtLooking = hs256Secret();
        const hs = await fetch(`${url}/environment/9/log`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${jwtLooking}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(logBody)
        });
        expect(hs.status).toBe(401);
        expect(secretLookup).toHaveBeenCalledWith(jwtLooking);
        expect(environmentLookup).not.toHaveBeenCalled();
    });

    it('rejects a sync-conflict request with a bad credential before parsing the body', async () => {
        const res = await fetch(`${url}/environment/9/runner/sync-conflict`, {
            method: 'PUT',
            headers: { Authorization: 'Bearer wrong-secret', 'Content-Type': 'application/json' },
            body: '{'
        });
        expect(res.status).toBe(401);
    });

    it('authorize rejects an unknown path param for a task token and a secret', async () => {
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: material.raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const app = express();
        app.use('/environment/:environmentId', authenticate(registry));
        app.get('/environment/:environmentId/x/:bogus', authorize('persist:log'), (_req, res) => {
            res.status(204).end();
        });
        const { url: bareUrl, close: closeBare } = await listen(app);
        try {
            const bearer = await token(['persist:log']);
            const task = await fetch(`${bareUrl}/environment/9/x/nope`, { headers: { Authorization: `Bearer ${bearer}` } });
            expect(task.status).toBe(400);
            expect(await task.json()).toMatchObject({ error: { code: 'invalid_route_param' } });

            const secret = await fetch(`${bareUrl}/environment/9/x/nope`, { headers: { Authorization: 'Bearer secret-key' } });
            expect(secret.status).toBe(400);
            expect(await secret.json()).toMatchObject({ error: { code: 'invalid_route_param' } });
        } finally {
            await closeBare();
        }
    });

    it('authorizeBodySyncId checks the task token sync id after the body is parsed', async () => {
        const registry = keyRegistryFromPublicKeys([{ kid: 'jobs-2026-09', publicKey: material.raw }], INTERNAL_SERVICE_ISSUER_JOBS);
        const app = express();
        app.use('/environment/:environmentId', authenticate(registry));
        app.put('/environment/:environmentId/runner/sync-conflict', authorize('persist:sync-conflict'), express.json(), authorizeBodySyncId, (_req, res) => {
            res.status(204).end();
        });
        const { url: bareUrl, close: closeBare } = await listen(app);
        try {
            const bearer = await token(['persist:sync-conflict']);
            const mismatch = await fetch(`${bareUrl}/environment/9/runner/sync-conflict`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ syncId: 'sync-b' })
            });
            expect(mismatch.status).toBe(401);
            expect(await mismatch.json()).toMatchObject({ error: { code: 'unauthorized' } });

            const match = await fetch(`${bareUrl}/environment/9/runner/sync-conflict`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ syncId: 'sync-a' })
            });
            expect(match.status).toBe(204);
        } finally {
            await closeBare();
        }
    });
});

it('authorize returns 401 when no credential was recorded, even if the environment is already set', async () => {
    const app = express();
    app.post(
        '/environment/:environmentId/log',
        (_req, res, next) => {
            res.locals['environment'] = { id: 9, name: 'dev' };
            next();
        },
        authorize('persist:log'),
        (_req, res) => {
            res.status(204).end();
        }
    );
    const { url, close } = await listen(app);
    try {
        const res = await fetch(`${url}/environment/9/log`, { method: 'POST' });
        expect(res.status).toBe(401);
        expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } });
    } finally {
        await close();
    }
});

function registeredRoutes(): { method: string; path: string }[] {
    const stack = (server as unknown as { router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } }).router.stack;
    return stack.flatMap((layer) => {
        const route = layer.route;
        if (!route) {
            return [];
        }
        return Object.entries(route.methods)
            .filter(([, enabled]) => enabled)
            .map(([method]) => ({ method: method.toUpperCase(), path: route.path }));
    });
}

function scopeFor(path: string): TaskCapabilityScope {
    if (path.endsWith('/log')) {
        return 'persist:log';
    }
    if (path.includes('/checkpoint')) {
        return 'persist:checkpoint';
    }
    if (path.includes('/cursor')) {
        return 'persist:cursor';
    }
    if (path.includes('/telemetry')) {
        return 'persist:telemetry';
    }
    if (path.includes('/abort')) {
        return 'persist:abort';
    }
    if (path.includes('/sync-conflict')) {
        return 'persist:sync-conflict';
    }
    if (path.includes('/locks')) {
        return 'persist:locks';
    }
    if (path.includes('/records') || path.includes('/outdated')) {
        return 'persist:records';
    }
    throw new Error(`no scope for ${path}`);
}

function fillPath(path: string, values: Record<string, string>): string {
    return path.replace(/:([A-Za-z]+)/g, (_, name: string) => values[name] ?? name);
}
