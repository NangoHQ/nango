import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    INTERNAL_SERVICE_AUDIENCE_JOBS,
    INTERNAL_SERVICE_AUDIENCE_PERSIST,
    INTERNAL_SERVICE_AUDIENCE_SERVER,
    INTERNAL_SERVICE_ISSUER_JOBS,
    mint,
    taskSubject
} from '@nangohq/internal-auth';
import { ed25519TestMaterial, mintTaskCapabilityToken } from '@nangohq/internal-auth/testing';
import { accountService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import type { PersistAuthContext } from '@nangohq/types';

const material = ed25519TestMaterial();
process.env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS'] = JSON.stringify([{ kid: 'jobs-2026-09', publicKey: material.raw }]);

const { server } = await import('../server.js');
const { authMiddleware } = await import('./auth.middleware.js');

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

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
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

    it('T8: a token gets a 401 on a route registered with null and on a route that was never given a scope', async () => {
        const bearer = await token(['persist:log']);
        const health = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${bearer}` } });
        expect(health.status).toBe(401);

        const open = await fetch(`${url}/health`);
        expect(open.status).toBe(200);

        const app = express();
        app.use('/environment/:environmentId/*splat', authMiddleware);
        app.get('/environment/:environmentId/unscoped', (_req, res) => {
            res.status(204).end();
        });
        const unscoped = await listen(app);
        try {
            const res = await fetch(`${unscoped.url}/environment/9/unscoped`, { headers: { Authorization: `Bearer ${bearer}` } });
            expect(res.status).toBe(401);
            expect(secretLookup).not.toHaveBeenCalled();
        } finally {
            await unscoped.close();
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
});
