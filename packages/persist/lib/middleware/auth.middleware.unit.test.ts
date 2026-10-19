import { generateKeyPairSync } from 'node:crypto';

import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { INTERNAL_SERVICE_ISSUER_JOBS, mint, TASK_CAPABILITY_SCOPES, taskScopesForScriptType, taskSubject } from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { authMiddleware } from './auth.middleware.js';
import { denyTaskTokenWithoutCapability, requireTaskCapability } from './capability.js';

import type { PersistAuthContext } from '@nangohq/types';

const context: PersistAuthContext = {
    account: { id: 1 },
    environment: { id: 9, name: 'dev' },
    plan: { id: 1, name: 'free', records_store: 'default' }
};

function ed25519Material(): { pem: string; raw: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
        .subarray(12)
        .toString('base64url');
    return { pem, raw };
}

function app() {
    const server = express();
    server.use('/environment/:environmentId/*splat', authMiddleware);
    server.post('/environment/:environmentId/log', denyTaskTokenWithoutCapability, (_req, res) => {
        res.status(204).end();
    });
    server.post(
        '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:jobId/records',
        requireTaskCapability(TASK_CAPABILITY_SCOPES.persistRecords),
        denyTaskTokenWithoutCapability,
        (_req, res) => {
            res.status(204).end();
        }
    );
    server.put(
        '/environment/:environmentId/runner/sync-conflict',
        express.json(),
        requireTaskCapability(TASK_CAPABILITY_SCOPES.persistSyncConflict, { bodySyncId: 'syncId' }),
        denyTaskTokenWithoutCapability,
        (_req, res) => {
            res.status(204).end();
        }
    );
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
                    new Promise((done) => {
                        httpServer.close(() => done());
                    })
            });
        });
    });
}

const signer = ed25519Material();

function capabilityToken(overrides: { connectionId?: number; scopes?: readonly string[]; ttlSecs?: number; syncId?: string } = {}) {
    return mint(
        { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: signer.pem },
        {
            sub: taskSubject('task-1'),
            aud: ['jobs', 'persist', 'server'],
            ttlSecs: overrides.ttlSecs ?? 60,
            res: { environmentId: 9, connectionId: overrides.connectionId ?? 1, syncId: overrides.syncId ?? 'sync-1' },
            scopes: overrides.scopes ?? taskScopesForScriptType('sync')
        }
    );
}

describe('persist capability auth', () => {
    const previousKeys = envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS;

    afterEach(() => {
        vi.restoreAllMocks();
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = previousKeys;
    });

    it('rejects a task token on a route that did not declare a capability', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: signer.raw }];
        vi.spyOn(accountService, 'getPersistAuthContextByEnvironmentId').mockResolvedValue(Ok(context));
        const token = await capabilityToken();
        const { url, close } = await listen(app());
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

    it('accepts a scoped token for the matching environment and connection', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: signer.raw }];
        vi.spyOn(accountService, 'getPersistAuthContextByEnvironmentId').mockResolvedValue(Ok(context));
        const token = await capabilityToken();
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/connection/1/sync/sync-1/job/4/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(204);
            expect(accountService.getPersistAuthContextByEnvironmentId).toHaveBeenCalledWith(9);
        } finally {
            await close();
        }
    });

    it('rejects a token minted for connection A on connection B', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: signer.raw }];
        vi.spyOn(accountService, 'getPersistAuthContextByEnvironmentId').mockResolvedValue(Ok(context));
        const token = await capabilityToken({ connectionId: 1 });
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/connection/2/sync/sync-1/job/4/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a token after it expires', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: signer.raw }];
        const token = await capabilityToken({ ttlSecs: -1 });
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/connection/1/sync/sync-1/job/4/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a persist:log token on a records route', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: signer.raw }];
        vi.spyOn(accountService, 'getPersistAuthContextByEnvironmentId').mockResolvedValue(Ok(context));
        const token = await capabilityToken({ scopes: [TASK_CAPABILITY_SCOPES.persistLog] });
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/connection/1/sync/sync-1/job/4/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a sync-conflict token for a different sync id in the body', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: signer.raw }];
        vi.spyOn(accountService, 'getPersistAuthContextByEnvironmentId').mockResolvedValue(Ok(context));
        const token = await capabilityToken({ syncId: 'sync-1' });
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/runner/sync-conflict`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ syncId: 'sync-2' })
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('rejects a records token on a different sync', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: signer.raw }];
        vi.spyOn(accountService, 'getPersistAuthContextByEnvironmentId').mockResolvedValue(Ok(context));
        const token = await capabilityToken({ syncId: 'sync-1' });
        const { url, close } = await listen(app());
        try {
            const res = await fetch(`${url}/environment/9/connection/1/sync/sync-2/job/4/records`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });
});
