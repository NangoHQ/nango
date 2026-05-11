import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getRunnerClient } from './client.js';
import { server } from './server.js';

import type { DBSyncConfig, NangoProps } from '@nangohq/types';
import type { Server } from 'node:http';

describe('Runner client', () => {
    let client: ReturnType<typeof getRunnerClient>;
    let httpServer: Server;
    const nangoProps: NangoProps = {
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
        runnerFlags: {} as any,
        endUser: null,
        team: { id: 1, name: 'team' },
        heartbeatTimeoutSecs: 30,
        logger: { level: 'off' }
    };

    beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
            httpServer = server.listen(0, '127.0.0.1', () => {
                const addr = httpServer.address();
                if (addr === null || typeof addr === 'string') {
                    reject(new Error('Runner test server failed to bind'));
                    return;
                }
                const { port } = addr;
                const serverUrl = `http://127.0.0.1:${port}`;
                client = getRunnerClient(serverUrl, {
                    headersTimeoutMs: 3_000,
                    connectTimeoutMs: 2_000,
                    responseTimeoutMs: 5_000
                });
                resolve();
            });
            httpServer.on('error', reject);
        });
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            httpServer.close((err) => (err ? reject(err) : resolve()));
        });
    });

    it('should get server health', async () => {
        const result = await client.health.query();
        expect(result).toEqual({ status: 'ok' });
    });

    it('should start script', async () => {
        const jsCode = `exports.default = async (nango) => [1, 2, 3]`;
        const taskId = 'task-id';
        const start = client.start.mutate({ taskId, nangoProps, code: jsCode });
        await expect(start).resolves.toEqual(true);
    });
});
