import { expect, describe, it, beforeAll } from 'vitest';
import { getRunnerClient } from './client.js';
import { server } from './server.js';
import type { DBSyncConfig, NangoProps } from '@nangohq/types';

describe('Runner client', () => {
    const port = 3095;
    const serverUrl = `http://localhost:${port}`;
    let client: ReturnType<typeof getRunnerClient>;
    const nangoProps: NangoProps = {
        scriptType: 'sync',
        host: 'http://localhost:3003',
        connectionId: 'connection-id',
        environmentId: 1,
        providerConfigKey: 'provider-config-key',
        provider: 'provider',
        activityLogId: '1',
        secretKey: 'secret-key',
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
        endUser: null
    };

    beforeAll(() => {
        client = getRunnerClient(serverUrl);
        server.listen(port);
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
