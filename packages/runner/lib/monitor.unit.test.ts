import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { RunnerMonitor } from './monitor.js';

import type { PersistClient } from './clients/persist.js';
import type { DBSyncConfig, NangoProps, ScriptType } from '@nangohq/types';

vi.hoisted(() => {
    vi.stubEnv('RUNNER_NODE_ID', '1');
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

function createPersistClientMock() {
    const putSyncConflict = vi.fn().mockResolvedValue(Ok(undefined));
    const deleteSyncConflict = vi.fn().mockResolvedValue(Ok(undefined));
    return {
        client: { putSyncConflict, deleteSyncConflict } as unknown as PersistClient,
        putSyncConflict,
        deleteSyncConflict
    };
}

describe('RunnerMonitor conflict tracking', () => {
    let monitor: RunnerMonitor;

    beforeEach(() => {
        vi.spyOn(global, 'setInterval').mockImplementation(() => null as unknown as NodeJS.Timeout);
        vi.spyOn(global, 'setTimeout').mockImplementation(() => null as unknown as NodeJS.Timeout);
        monitor = new RunnerMonitor({ runnerId: 1 });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('distributed conflicts', () => {
        let putSyncConflict: ReturnType<typeof vi.fn>;
        let deleteSyncConflict: ReturnType<typeof vi.fn>;
        let persistClient: PersistClient;

        beforeEach(() => {
            const mock = createPersistClientMock();
            putSyncConflict = mock.putSyncConflict;
            deleteSyncConflict = mock.deleteSyncConflict;
            persistClient = mock.client;
        });

        describe('track', () => {
            it('acquires sync conflict lock when scriptType is sync', async () => {
                const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-123', environmentId: 1 });
                await monitor.track(nangoProps, 'task-1', { persistClient });

                expect(putSyncConflict).toHaveBeenCalledWith({
                    environmentId: 1,
                    scriptType: 'sync',
                    syncId: 'sync-123',
                    refresh: false
                });
            });

            it('does not acquire sync conflict lock when scriptType is not sync', async () => {
                const nangoProps = createNangoProps({ scriptType: 'webhook', syncId: 'webhook-789', environmentId: 1 });
                await monitor.track(nangoProps, 'task-3', { persistClient });

                expect(putSyncConflict).not.toHaveBeenCalled();
            });

            it('removes tracked entry when sync conflict acquisition fails', async () => {
                const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-conflict', environmentId: 1 });
                await monitor.track(nangoProps, 'task-1', { persistClient });
                putSyncConflict.mockResolvedValueOnce(Err(new Error('Conflicting sync detected')));

                await expect(monitor.track(nangoProps, 'task-2', { persistClient })).rejects.toThrow('Conflicting sync detected');

                expect((monitor as unknown as { tracked: Map<string, unknown> }).tracked.size).toBe(1);
                expect((monitor as unknown as { tracked: Map<string, unknown> }).tracked.has('task-2')).toBe(false);
            });
        });

        describe('untrack', () => {
            it('releases sync conflict lock when task had tracked sync', async () => {
                const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-untrack', environmentId: 1 });
                await monitor.track(nangoProps, 'task-untrack', { persistClient });
                await monitor.untrack('task-untrack');

                expect(deleteSyncConflict).toHaveBeenCalledWith({
                    environmentId: 1,
                    scriptType: 'sync',
                    syncId: 'sync-untrack'
                });
            });
        });

        describe('trackForConflicts', () => {
            it('refreshes sync conflict lock via persist client', async () => {
                const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-refresh', environmentId: 1 });
                await monitor.track(nangoProps, 'task-refresh', { persistClient });

                await monitor.trackForConflicts('task-refresh', { refresh: true });

                expect(putSyncConflict).toHaveBeenLastCalledWith({
                    environmentId: 1,
                    scriptType: 'sync',
                    syncId: 'sync-refresh',
                    refresh: true
                });
            });
        });
    });

    describe('local conflicts', () => {
        it('tracks sync conflicts in-process when no persist client is passed', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-local', environmentId: 1 });
            await monitor.track(nangoProps, 'task-local');

            await expect(monitor.track(nangoProps, 'task-local-2')).rejects.toThrow('Conflicting sync detected');
            expect((monitor as unknown as { tracked: Map<string, unknown> }).tracked.size).toBe(1);
            expect((monitor as unknown as { tracked: Map<string, unknown> }).tracked.has('task-local-2')).toBe(false);
        });

        it('releases local sync conflict on untrack', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-release', environmentId: 1 });
            await monitor.track(nangoProps, 'task-release');
            await monitor.untrack('task-release');

            await expect(monitor.track(nangoProps, 'task-release-2')).resolves.toBeUndefined();
        });

        it('refreshes local sync conflict on heartbeat', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-heartbeat', environmentId: 1 });
            await monitor.track(nangoProps, 'task-heartbeat');

            await expect(monitor.trackForConflicts('task-heartbeat', { refresh: true })).resolves.toBeUndefined();
        });
    });
});
