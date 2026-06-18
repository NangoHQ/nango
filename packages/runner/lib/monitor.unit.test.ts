import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { PersistClient } from './clients/persist.js';
import { RunnerMonitor } from './monitor.js';

import type { DBSyncConfig, NangoProps, ScriptType } from '@nangohq/types';

vi.hoisted(() => {
    vi.stubEnv('RUNNER_NODE_ID', '1');
    vi.stubEnv('RUNNER_CONFLICT_RESOLUTION_MODE', 'DISTRIBUTED');
});

function createNangoProps(overrides: { scriptType: ScriptType; syncId: string; environmentId: number }): NangoProps {
    return {
        scriptType: overrides.scriptType,
        host: 'http://localhost:3003',
        connectionId: 'connection-id',
        environmentId: overrides.environmentId,
        environmentName: 'dev',
        providerConfigKey: 'provider-config-key',
        provider: 'provider',
        activityLogId: '1',
        secretKey: 'secret-key',
        nangoConnectionId: 1,
        syncId: overrides.syncId,
        syncJobId: 1,
        lastSyncDate: new Date(),
        attributes: {},
        track_deletes: false,
        syncConfig: {} as DBSyncConfig,
        debug: false,
        startedAt: new Date(),
        team: { id: 1, name: 'dev' },
        logger: { level: 'off' },
        runnerFlags: {
            validateActionInput: false,
            validateActionOutput: false,
            validateSyncMetadata: false,
            validateSyncRecords: false,
            exportRunnerTelemetry: false
        },
        endUser: null,
        heartbeatTimeoutSecs: 30
    };
}

describe('RunnerMonitor conflict tracking', () => {
    let monitor: RunnerMonitor;
    let putSyncConflict: ReturnType<typeof vi.fn>;
    let deleteSyncConflict: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        putSyncConflict = vi.fn().mockResolvedValue(Ok(undefined));
        deleteSyncConflict = vi.fn().mockResolvedValue(Ok(undefined));
        vi.spyOn(PersistClient.prototype, 'putSyncConflict').mockImplementation(putSyncConflict as never);
        vi.spyOn(PersistClient.prototype, 'deleteSyncConflict').mockImplementation(deleteSyncConflict as never);
        vi.spyOn(global, 'setInterval').mockImplementation(() => null as unknown as NodeJS.Timeout);
        vi.spyOn(global, 'setTimeout').mockImplementation(() => null as unknown as NodeJS.Timeout);
        monitor = new RunnerMonitor({ runnerId: 1 });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('track', () => {
        it('acquires sync conflict lock when scriptType is sync', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-123', environmentId: 1 });
            await monitor.track(nangoProps, 'task-1');

            expect(putSyncConflict).toHaveBeenCalledWith({
                environmentId: 1,
                scriptType: 'sync',
                syncId: 'sync-123',
                refresh: false
            });
        });

        it('does not acquire sync conflict lock when scriptType is not sync', async () => {
            const nangoProps = createNangoProps({ scriptType: 'webhook', syncId: 'webhook-789', environmentId: 1 });
            await monitor.track(nangoProps, 'task-3');

            expect(putSyncConflict).not.toHaveBeenCalled();
        });
    });

    describe('untrack', () => {
        it('releases sync conflict lock when task had tracked sync', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-untrack', environmentId: 1 });
            await monitor.track(nangoProps, 'task-untrack');
            await monitor.untrack('task-untrack');

            expect(deleteSyncConflict).toHaveBeenCalledWith({
                environmentId: 1,
                scriptType: 'sync',
                syncId: 'sync-untrack'
            });
        });
    });
});
