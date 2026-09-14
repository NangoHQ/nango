import { afterEach, describe, expect, it } from 'vitest';

import { createInternalServiceToken, createRunnerDispatchToken, exportRunnerPublicKey, INTERNAL_SERVICE_AUDIENCE_JOBS } from '@nangohq/internal-auth';

import { getRunnerClient } from './client.js';
import { envs } from './env.js';
import { getServer } from './server.js';

import type { InternalAuthEnvs } from '@nangohq/internal-auth';

const jobsSigningKey = 'sign';
const runnerPublicKey = exportRunnerPublicKey(jobsSigningKey)!;

const authEnvs: InternalAuthEnvs = {
    NANGO_INTERNAL_AUTH_REQUIRED: false,
    NANGO_INTERNAL_AUTH_RUNNER_PUBLIC_KEY: runnerPublicKey
};

const httpOpts = {
    headersTimeoutMs: 3_000,
    connectTimeoutMs: 2_000,
    responseTimeoutMs: 5_000
};

afterEach(() => {
    authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = false;
    authEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = undefined;
});

async function listen() {
    const app = getServer(authEnvs);
    return await new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
        const httpServer = app.listen(0, '127.0.0.1', () => {
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

function runnerTaskToken(taskId: string): string {
    return createRunnerDispatchToken({ taskId, expiresInSecs: 120 }, jobsSigningKey)!;
}

function runnerNodeToken(nodeId: string): string {
    return createRunnerDispatchToken({ op: 'node', nodeId, expiresInSecs: 120 }, jobsSigningKey)!;
}

describe('runner internal service auth', () => {
    it('serves /health without a credential when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const res = await fetch(`${url}/health`);
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ result: { data: { json: { status: 'ok' } } } });
        } finally {
            await close();
        }
    });

    it('returns 401 on start without a credential when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const res = await fetch(`${url}/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({ error: { code: 'missing_auth_header' } });
        } finally {
            await close();
        }
    });

    it('returns 401 on abort without a credential when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const res = await fetch(`${url}/abort`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({ error: { code: 'missing_auth_header' } });
        } finally {
            await close();
        }
    });

    it('returns 401 on notifyWhenIdle without a credential when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const res = await fetch(`${url}/notifyWhenIdle`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({ error: { code: 'missing_auth_header' } });
        } finally {
            await close();
        }
    });

    it('returns 401 for a jobs-audience JWT on start when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const jobsToken = createInternalServiceToken({ taskId: 'task-1', audience: INTERNAL_SERVICE_AUDIENCE_JOBS, expiresInSecs: 120 }, jobsSigningKey);
        const { url, close } = await listen();
        try {
            const res = await fetch(`${url}/start`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${jobsToken}` },
                body: '{}'
            });
            expect(res.status).toBe(401);
            expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } });
        } finally {
            await close();
        }
    });

    it('returns 401 for an HMAC runner-audience JWT minted from runner-held public key material', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const forged = createInternalServiceToken({ audience: 'runner', taskId: 'task-id', expiresInSecs: 120 }, runnerPublicKey);
        const { url, close } = await listen();
        try {
            const res = await fetch(`${url}/start`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${forged}` },
                body: JSON.stringify({ taskId: 'task-id' })
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('returns 401 for an HMAC runner-audience JWT even if a leftover signing key is present', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        authEnvs.NANGO_INTERNAL_AUTH_SIGNING_KEY = jobsSigningKey;
        const hmac = createInternalServiceToken({ audience: 'runner', taskId: 'task-id', expiresInSecs: 120 }, jobsSigningKey);
        const { url, close } = await listen();
        try {
            const res = await fetch(`${url}/start`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${hmac}` },
                body: JSON.stringify({ taskId: 'task-id' })
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('returns 401 for garbage on start when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const res = await fetch(`${url}/start`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: 'Bearer not-a-jwt' },
                body: '{}'
            });
            expect(res.status).toBe(401);
        } finally {
            await close();
        }
    });

    it('accepts a task-bound mutation with a matching runner-audience JWT when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const client = getRunnerClient(url, httpOpts, { token: runnerTaskToken('task-id') });
            // abort shares start's task-bound procedure and does not exec() or call jobs
            await expect(client.abort.mutate({ taskId: 'task-id' })).resolves.toBe(false);
        } finally {
            await close();
        }
    });

    it('rejects a task-bound mutation when the JWT is bound to a different task', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const client = getRunnerClient(url, httpOpts, { token: runnerTaskToken('other-task') });
            await expect(client.abort.mutate({ taskId: 'task-id' })).rejects.toThrow();
        } finally {
            await close();
        }
    });

    it('accepts notifyWhenIdle with a matching runner-audience node JWT when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const client = getRunnerClient(url, httpOpts, { token: runnerNodeToken(String(envs.RUNNER_NODE_ID)) });
            await expect(client.notifyWhenIdle.mutate()).resolves.toEqual(true);
        } finally {
            await close();
        }
    });
});
