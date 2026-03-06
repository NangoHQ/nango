import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryKVStore } from '@nangohq/kvstore';

import { RunnerMonitor } from './monitor.js';

import type { DBSyncConfig, NangoProps, ScriptType } from '@nangohq/types';

function createNangoProps(overrides: { scriptType: ScriptType; syncId?: string }): NangoProps {
    return {
        scriptType: overrides.scriptType,
        host: 'http://localhost:3003',
        connectionId: 'connection-id',
        environmentId: 1,
        environmentName: 'dev',
        providerConfigKey: 'provider-config-key',
        provider: 'provider',
        activityLogId: '1',
        secretKey: 'secret-key',
        nangoConnectionId: 1,
        syncId: overrides.syncId ?? 'sync-id',
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
            validateSyncRecords: false
        },
        endUser: null,
        heartbeatTimeoutSecs: 30
    };
}

describe('RunnerMonitor conflict tracking', () => {
    let tracker: InMemoryKVStore;
    let monitor: RunnerMonitor;

    beforeEach(() => {
        tracker = new InMemoryKVStore();
        vi.spyOn(global, 'setInterval').mockImplementation(() => null as unknown as NodeJS.Timeout);
        vi.spyOn(global, 'setTimeout').mockImplementation(() => null as unknown as NodeJS.Timeout);
        monitor = new RunnerMonitor({
            runnerId: 1,
            conflictTracking: {
                tracker,
                functionTypes: ['sync', 'action']
            }
        });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await tracker.destroy();
    });

    describe('track', () => {
        it('writes conflict key to KV store when scriptType is in functionTypes', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-123' });
            await monitor.track(nangoProps, 'task-1');

            const key = 'function:sync:sync-123';
            const exists = await tracker.exists(key);
            expect(exists).toBe(true);

            const value = await tracker.get(key);
            expect(value).toBe('1');
        });

        it('uses key format function:scriptType:syncId', async () => {
            const nangoProps = createNangoProps({ scriptType: 'action', syncId: 'action-456' });
            await monitor.track(nangoProps, 'task-2');

            expect(await tracker.exists('function:action:action-456')).toBe(true);
            expect(await tracker.get('function:action:action-456')).toBe('1');
        });

        it('does not write to KV store when scriptType is not in functionTypes', async () => {
            const nangoProps = createNangoProps({ scriptType: 'webhook', syncId: 'webhook-789' });
            await monitor.track(nangoProps, 'task-3');

            expect(await tracker.exists('function:webhook:webhook-789')).toBe(false);
        });

        it('does not write to KV store for on-event when not in functionTypes', async () => {
            const nangoProps = createNangoProps({ scriptType: 'on-event', syncId: 'on-event-1' });
            await monitor.track(nangoProps, 'task-4');

            expect(await tracker.exists('function:on-event:on-event-1')).toBe(false);
        });
    });

    describe('untrack', () => {
        it('removes conflict key from KV store when task had tracked scriptType', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-untrack' });
            await monitor.track(nangoProps, 'task-untrack');
            expect(await tracker.exists('function:sync:sync-untrack')).toBe(true);

            await monitor.untrack('task-untrack');
            expect(await tracker.exists('function:sync:sync-untrack')).toBe(false);
        });

        it('does not delete key for scriptType not in functionTypes', async () => {
            const nangoProps = createNangoProps({ scriptType: 'webhook', syncId: 'wh-1' });
            await monitor.track(nangoProps, 'task-w');
            await monitor.untrack('task-w');
            expect(await tracker.exists('function:webhook:wh-1')).toBe(false);
        });
    });

    describe('hasConflictingSync', () => {
        it('returns true when same scriptType and syncId are already tracked', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'conflict-sync' });
            await monitor.track(nangoProps, 'task-a');

            const newTask = createNangoProps({ scriptType: 'sync', syncId: 'conflict-sync' });
            const hasConflict = await monitor.hasConflictingSync(newTask);
            expect(hasConflict).toBe(true);
        });

        it('returns false when syncId differs for same scriptType', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-one' });
            await monitor.track(nangoProps, 'task-b');

            const newTask = createNangoProps({ scriptType: 'sync', syncId: 'sync-two' });
            const hasConflict = await monitor.hasConflictingSync(newTask);
            expect(hasConflict).toBe(false);
        });

        it('returns false when scriptType is not in functionTypes', async () => {
            const nangoProps = createNangoProps({ scriptType: 'webhook', syncId: 'webhook-1' });
            await monitor.track(nangoProps, 'task-c');

            const newTask = createNangoProps({ scriptType: 'webhook', syncId: 'webhook-1' });
            const hasConflict = await monitor.hasConflictingSync(newTask);
            expect(hasConflict).toBe(false);
        });

        it('returns false after untrack for same scriptType and syncId', async () => {
            const nangoProps = createNangoProps({ scriptType: 'action', syncId: 'action-x' });
            await monitor.track(nangoProps, 'task-d');
            expect(await monitor.hasConflictingSync(createNangoProps({ scriptType: 'action', syncId: 'action-x' }))).toBe(true);

            await monitor.untrack('task-d');
            const hasConflict = await monitor.hasConflictingSync(createNangoProps({ scriptType: 'action', syncId: 'action-x' }));
            expect(hasConflict).toBe(false);
        });
    });
});
