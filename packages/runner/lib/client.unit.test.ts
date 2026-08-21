import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getRunnerClient } from './client.js';
import { server } from './server.js';

import type { DBSyncConfig, NangoProps } from '@nangohq/types';
import type { Server } from 'node:http';

const httpOpts = {
    headersTimeoutMs: 3_000,
    connectTimeoutMs: 2_000,
    responseTimeoutMs: 5_000
};

describe('Runner client', () => {
    const port = 3095;
    const serverUrl = `http://localhost:${port}`;
    let client: ReturnType<typeof getRunnerClient>;
    let srv: Server;
    let connectionCount = 0;
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

    beforeAll(() => {
        client = getRunnerClient(serverUrl, httpOpts);
        srv = server.listen(port);
        srv.on('connection', () => {
            connectionCount++;
        });
    });

    afterAll(() => {
        srv.close();
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

    it('should reuse connections across clients', async () => {
        const before = connectionCount;

        const first = getRunnerClient(serverUrl, httpOpts);
        await first.health.query();
        const second = getRunnerClient(serverUrl, httpOpts);
        await second.health.query();

        expect(connectionCount).toBe(before);
    });
});
