import { expect, describe, it, beforeAll } from 'vitest';
import { getRunnerClient } from './client.js';
import { server } from './server.js';
import type { NangoProps, SyncConfig } from '@nangohq/shared';

describe('Runner client', () => {
    const port = 3095;
    const serverUrl = `http://localhost:${port}`;
    let client: ReturnType<typeof getRunnerClient>;
    const nangoProps: NangoProps = {
        host: 'http://localhost:3003',
        connectionId: 'connection-id',
        environmentId: 1,
        providerConfigKey: 'provider-config-key',
        activityLogId: '1',
        secretKey: 'secret-key',
        nangoConnectionId: 1,
        syncId: 'sync-id',
        syncJobId: 1,
        lastSyncDate: new Date(),
        dryRun: true,
        attributes: {},
        track_deletes: false,
        logMessages: {
            counts: { updated: 0, added: 0, deleted: 0 },
            messages: []
        },
        syncConfig: {} as SyncConfig,
        runnerFlags: {} as any,
        stubbedMetadata: {}
    };

    beforeAll(() => {
        client = getRunnerClient(serverUrl);
        server.listen(port);
    });

    it('should get server health', async () => {
        const result = await client.health.query();
        expect(result).toEqual({ status: 'ok' });
    });

    it('should run script', async () => {
        const jsCode = `exports.default = async (nango) => [1, 2, 3]`;
        const isInvokedImmediately = false;
        const isWebhook = false;

        const run = client.run.mutate({ nangoProps, isInvokedImmediately, isWebhook, code: jsCode });
        await expect(run).resolves.toEqual([1, 2, 3]);
    });

    it('should start script', async () => {
        const jsCode = `exports.default = async (nango) => [1, 2, 3]`;
        const taskId = 'task-id';
        const start = client.start.mutate({ taskId, nangoProps, scriptType: 'sync', code: jsCode });
        await expect(start).resolves.toEqual(true);
    });
});
