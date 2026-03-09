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
                tracker
            }
        });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await tracker.destroy();
    });

    describe('track', () => {
        it('writes conflict key to KV store when scriptType is sync', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-123' });
            await monitor.track(nangoProps, 'task-1');

            const key = 'function:sync:sync-123';
            const exists = await tracker.exists(key);
            expect(exists).toBe(true);

            const value = await tracker.get(key);
            expect(value).toBe('1');
        });

        it('does not write to KV store when scriptType is not sync', async () => {
            const nangoProps = createNangoProps({ scriptType: 'webhook', syncId: 'webhook-789' });
            await monitor.track(nangoProps, 'task-3');

            expect(await tracker.exists('function:webhook:webhook-789')).toBe(false);
        });
    });

    describe('untrack', () => {
        it('removes conflict key from KV store when task had tracked sync', async () => {
            const nangoProps = createNangoProps({ scriptType: 'sync', syncId: 'sync-untrack' });
            await monitor.track(nangoProps, 'task-untrack');
            expect(await tracker.exists('function:sync:sync-untrack')).toBe(true);

            await monitor.untrack('task-untrack');
            expect(await tracker.exists('function:sync:sync-untrack')).toBe(false);
        });
    });
});
