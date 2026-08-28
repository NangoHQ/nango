import { afterEach, describe, expect, it } from 'vitest';

import { createInternalServiceToken, deriveRunnerSigningKey, INTERNAL_SERVICE_AUDIENCE_JOBS, INTERNAL_SERVICE_AUDIENCE_RUNNER } from '@nangohq/internal-auth';

import { getRunnerClient } from './client.js';
import { getServer } from './server.js';

import type { InternalAuthEnvs } from '@nangohq/internal-auth';
import type { DBSyncConfig, NangoProps } from '@nangohq/types';

const derivedKey = deriveRunnerSigningKey('sign')!;

const authEnvs: InternalAuthEnvs = {
    NANGO_INTERNAL_AUTH_REQUIRED: false,
    NANGO_INTERNAL_AUTH_SIGNING_KEY: derivedKey
};

const httpOpts = {
    headersTimeoutMs: 3_000,
    connectTimeoutMs: 2_000,
    responseTimeoutMs: 5_000
};

const nangoProps = {
    scriptType: 'sync',
    host: 'http://localhost:3003',
    connectionId: 'connection-id',
    environmentId: 1,
    providerConfigKey: 'provider-config-key',
    provider: 'provider',
    activityLogId: '1',
    secretKey: 'secret-key',
    environmentName: 'dev',
    nangoConnectionId: 1,
    syncId: 'sync-id',
    syncJobId: 1,
    lastSyncDate: new Date(),
    attributes: {},
    track_deletes: false,
    syncConfig: {} as DBSyncConfig,
    debug: false,
    startedAt: new Date(),
    runnerFlags: {} as NangoProps['runnerFlags'],
    endUser: null,
    team: { id: 1, name: 'team' },
    heartbeatTimeoutSecs: 30,
    logger: { level: 'off' }
} as NangoProps;

afterEach(() => {
    authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = false;
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
    return createInternalServiceToken({ audience: INTERNAL_SERVICE_AUDIENCE_RUNNER, taskId, expiresInSecs: 120 }, derivedKey)!;
}

function runnerNodeToken(nodeId: string): string {
    return createInternalServiceToken({ audience: INTERNAL_SERVICE_AUDIENCE_RUNNER, op: 'node', nodeId, expiresInSecs: 120 }, derivedKey)!;
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
        const jobsToken = createInternalServiceToken({ taskId: 'task-1', audience: INTERNAL_SERVICE_AUDIENCE_JOBS, expiresInSecs: 120 }, derivedKey);
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

    it('accepts start with a matching runner-audience task JWT when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const client = getRunnerClient(url, httpOpts, { token: runnerTaskToken('task-id') });
            await expect(client.start.mutate({ taskId: 'task-id', nangoProps, code: `exports.default = async () => [1]` })).resolves.toEqual(true);
        } finally {
            await close();
        }
    });

    it('rejects start when the task JWT is bound to a different task', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const client = getRunnerClient(url, httpOpts, { token: runnerTaskToken('other-task') });
            await expect(client.start.mutate({ taskId: 'task-id', nangoProps, code: `exports.default = async () => [1]` })).rejects.toThrow();
        } finally {
            await close();
        }
    });

    it('accepts notifyWhenIdle with a matching runner-audience node JWT when REQUIRED is true', async () => {
        authEnvs.NANGO_INTERNAL_AUTH_REQUIRED = true;
        const { url, close } = await listen();
        try {
            const client = getRunnerClient(url, httpOpts, { token: runnerNodeToken('1') });
            await expect(client.notifyWhenIdle.mutate()).resolves.toEqual(true);
        } finally {
            await close();
        }
    });
});
