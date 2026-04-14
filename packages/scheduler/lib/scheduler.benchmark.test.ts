import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { getTestDbClient } from './db/helpers.test.js';
import { Scheduler } from './scheduler.js';

import type { Task } from './types.js';

describe('Scheduler benchmarks', () => {
    const dbClient = getTestDbClient();
    const callbacks = {
        CREATED: vi.fn(),
        STARTED: vi.fn(),
        SUCCEEDED: vi.fn(),
        FAILED: vi.fn(),
        EXPIRED: vi.fn(),
        CANCELLED: vi.fn()
    };
    const scheduler = new Scheduler({ db: dbClient.db, on: callbacks, onError: () => {} });

    beforeAll(async () => {
        scheduler.start();
        await dbClient.migrate();
    });

    afterAll(async () => {
        await scheduler.stop();
        await dbClient.clearDatabase();
    });

    it('advisory lock should serialize webhook enqueues for the same group key', async () => {
        const concurrency = 10;
        const tasksPerProducer = 50;
        const sharedGroupKey = `webhook:bench:${nanoid()}`;
        const noLockGroupKey = `bench:${nanoid()}`;

        async function produceN(groupKey: string, n: number): Promise<void> {
            for (let i = 0; i < n; i++) {
                await immediate(scheduler, groupKey);
            }
        }

        // With advisory lock (webhook: prefix) — serialized per group
        const startLocked = performance.now();
        await Promise.all(Array.from({ length: concurrency }, () => produceN(sharedGroupKey, tasksPerProducer)));
        const elapsedLockedMs = performance.now() - startLocked;

        // Without advisory lock (no webhook: prefix) — fully parallel
        const startUnlocked = performance.now();
        await Promise.all(Array.from({ length: concurrency }, () => produceN(noLockGroupKey, tasksPerProducer)));
        const elapsedUnlockedMs = performance.now() - startUnlocked;

        const totalTasks = concurrency * tasksPerProducer;
        const lockedRate = totalTasks / (elapsedLockedMs / 1000);
        const unlockedRate = totalTasks / (elapsedUnlockedMs / 1000);

        console.log(`--- Advisory lock benchmark (${concurrency} producers x ${tasksPerProducer} tasks) ---`);
        console.log(`  With lock (webhook:):    ${elapsedLockedMs.toFixed(0)}ms — ${lockedRate.toFixed(0)} tasks/s`);
        console.log(`  Without lock:            ${elapsedUnlockedMs.toFixed(0)}ms — ${unlockedRate.toFixed(0)} tasks/s`);
        console.log(`  Ratio (unlocked/locked): ${(unlockedRate / lockedRate).toFixed(2)}x`);
    });
});

async function immediate(scheduler: Scheduler, groupKey: string): Promise<Task> {
    return (
        await scheduler.immediate({
            name: nanoid(),
            payload: {},
            groupKey,
            groupMaxConcurrency: 0,
            retryMax: 1,
            retryCount: 0,
            createdToStartedTimeoutSecs: 3600,
            startedToCompletedTimeoutSecs: 3600,
            heartbeatTimeoutSecs: 600,
            ownerKey: null,
            retryKey: null
        })
    ).unwrap();
}
