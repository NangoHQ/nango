import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ed25519TestMaterial, mintTaskCapabilityToken } from '@nangohq/internal-auth/testing';
import { accountService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import type { RequestLocals } from '../utils/express.js';
import type { DBTeam, EnvironmentWithoutSecrets } from '@nangohq/types';
import type { Express } from 'express';

const material = ed25519TestMaterial();
process.env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS'] = JSON.stringify([{ kid: 'jobs-2026-09', publicKey: material.raw }]);

const { withTaskCapability } = await import('./task-capability.js');
const { publicAPI } = await import('../routes.public.js');

const environment = {
    id: 9,
    name: 'dev',
    account_id: 1
} as EnvironmentWithoutSecrets;

const context = {
    account: { id: 1 } as DBTeam,
    environment,
    plan: null
};

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

async function token(scopes: string[]): Promise<string> {
    return await mintTaskCapabilityToken({
        privateKey: material.pem,
        taskId: 'task-1',
        res: { environmentId: 9, connectionId: 1 },
        scopes: scopes as Parameters<typeof mintTaskCapabilityToken>[0]['scopes']
    });
}

describe('task capability on the server', () => {
    const secretLookup = vi.spyOn(accountService, 'getAccountContextByApiKey');
    const environmentLookup = vi.spyOn(accountService, 'getTaskTokenAccountContext');
    let url: string;
    let probeUrl: string;
    let close: () => Promise<void>;
    let closeProbe: () => Promise<void>;
    let captured: Partial<RequestLocals> | undefined;

    beforeAll(async () => {
        secretLookup.mockResolvedValue(null);
        environmentLookup.mockImplementation((environmentId) => {
            if (environmentId === 9) {
                return Promise.resolve(Ok(context));
            }
            return Promise.resolve(Ok(null));
        });

        const app = express();
        app.use(publicAPI);
        const probed = express();
        probed.get('/proxy/check', ...withTaskCapability('api:proxy'), (_req, res) => {
            captured = res.locals;
            res.status(204).end();
        });
        ({ url, close } = await listen(app));
        ({ url: probeUrl, close: closeProbe } = await listen(probed));
    });

    afterAll(async () => {
        secretLookup.mockRestore();
        environmentLookup.mockRestore();
        await close();
        await closeProbe();
    });

    beforeEach(() => {
        secretLookup.mockClear();
        environmentLookup.mockClear();
        captured = undefined;
    });

    it('T11: a task token gets a 401 on a route without withTaskCapability', async () => {
        const bearer = await token(['api:connection:read', 'api:sync:trigger']);
        const patch = await fetch(`${url}/connections/abc`, { method: 'PATCH', headers: { Authorization: `Bearer ${bearer}` } });
        const pause = await fetch(`${url}/sync/pause`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
            body: '{}'
        });

        expect(patch.status).toBe(401);
        expect(pause.status).toBe(401);
        expect(await patch.json()).toMatchObject({ error: { code: 'unknown_account' } });
        expect(await pause.json()).toMatchObject({ error: { code: 'unknown_account' } });
        expect(secretLookup).not.toHaveBeenCalled();
        expect(environmentLookup).not.toHaveBeenCalled();
    });

    it('T12: a token without the route scope gets a 401, and a matching token sets taskToken locals', async () => {
        const missing = await fetch(`${probeUrl}/proxy/check`, {
            headers: { Authorization: `Bearer ${await token(['api:connection:read'])}` }
        });
        expect(missing.status).toBe(401);
        expect(environmentLookup).not.toHaveBeenCalled();

        const present = await fetch(`${probeUrl}/proxy/check`, {
            headers: { Authorization: `Bearer ${await token(['api:proxy'])}` }
        });
        expect(present.status).toBe(204);
        expect(captured?.authType).toBe('taskToken');
        expect(captured?.secret).toBeUndefined();
        expect(captured?.apiKeyAuthSource).toBe('task_token');
        expect(captured?.apiKeyPrincipal?.scopes).toEqual(['environment:proxy']);
        expect(captured?.principal?.subject.id).toBe('task:task-1');
        expect(secretLookup).not.toHaveBeenCalled();
    });

    it('an HS256 bearer stays on the secret path', async () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const res = await fetch(`${probeUrl}/proxy/check`, {
            headers: { Authorization: `Bearer ${header}.e30.sig` }
        });

        expect(res.status).toBe(401);
        expect(environmentLookup).not.toHaveBeenCalled();
    });
});
