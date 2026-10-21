import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ed25519TestMaterial } from '@nangohq/internal-auth/testing';

vi.hoisted(() => {
    process.env['FLAG_PLAN_ENABLED'] = 'true';
});

const material = ed25519TestMaterial();
process.env['NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS'] = JSON.stringify([{ kid: 'jobs-2026-09', publicKey: material.raw }]);

const { accountService } = await import('@nangohq/shared');
const { Ok } = await import('@nangohq/utils');
const { mintTaskCapabilityToken } = await import('@nangohq/internal-auth/testing');
const { withTaskCapability } = await import('./task-capability.js');

describe('task capability plan gate', () => {
    const environmentLookup = vi.spyOn(accountService, 'getTaskTokenAccountContext');
    let url: string;
    let close: () => Promise<void>;

    beforeAll(async () => {
        environmentLookup.mockResolvedValue(Ok({ account: { id: 1 }, environment: { id: 9, name: 'dev', account_id: 1 }, plan: null }) as never);
        const app = express();
        app.get('/proxy/check', ...withTaskCapability('api:proxy'), (_req, res) => {
            res.status(204).end();
        });
        ({ url, close } = await listen(app));
    });

    afterAll(async () => {
        environmentLookup.mockRestore();
        await close();
    });

    it('rejects a task token when plan enforcement is on and the account has no plan', async () => {
        const token = await mintTaskCapabilityToken({
            privateKey: material.pem,
            taskId: 'task-1',
            res: { environmentId: 9, connectionId: 1 },
            scopes: ['api:proxy']
        });
        const res = await fetch(`${url}/proxy/check`, { headers: { Authorization: `Bearer ${token}` } });

        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ error: { code: 'unhandled_plan_not_found' } });
    });
});

function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve) => {
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
