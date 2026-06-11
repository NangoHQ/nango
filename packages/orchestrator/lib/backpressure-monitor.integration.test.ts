import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Scheduler, getTestDbClient } from '@nangohq/scheduler';
import { metrics, nanoid } from '@nangohq/utils';

import { BackpressureMonitor } from './backpressure-monitor.js';

import type { Task } from '@nangohq/scheduler';

const noopCallbacks = {
    CREATED: () => {},
    STARTED: () => {},
    SUCCEEDED: () => {},
    FAILED: () => {},
    EXPIRED: () => {},
    CANCELLED: () => {}
};

describe('BackpressureMonitor', () => {
    const dbClient = getTestDbClient();
    let scheduler: Scheduler;

    beforeEach(async () => {
        await dbClient.migrate();
        scheduler = new Scheduler({ db: dbClient.db, on: noopCallbacks, onError: () => {} });
    });

    afterEach(async () => {
        await scheduler.stop();
        await dbClient.clearDatabase();
    });

    it('should emit ORCH_QUEUE_BACKPRESSURE for groups exceeding their max concurrency', async () => {
        const groupKey = `sync:env:${nanoid()}`;
        // Cap of 2, three queued -> backpressure
        for (let i = 0; i < 3; i++) {
            await immediate(scheduler, { groupKey, groupMaxConcurrency: 2 });
        }
        // Another group below its cap should not appear
        await immediate(scheduler, { groupKey: `sync:env:${nanoid()}`, groupMaxConcurrency: 5 });

        const spy = vi.spyOn(metrics, 'gauge').mockImplementation(() => {});
        const monitor = new BackpressureMonitor({ scheduler, tickIntervalMs: 1000, topN: 10, onError: () => {} });

        await monitor.run();

        const calls = spy.mock.calls.filter((call) => call[0] === metrics.Types.ORCH_QUEUE_BACKPRESSURE);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([metrics.Types.ORCH_QUEUE_BACKPRESSURE, 3, { groupKey, primitive: 'sync' }]);
        spy.mockRestore();
    });

    it('should not emit when no group is backpressured', async () => {
        await immediate(scheduler, { groupKey: `sync:env:${nanoid()}`, groupMaxConcurrency: 5 });

        const spy = vi.spyOn(metrics, 'gauge').mockImplementation(() => {});
        const monitor = new BackpressureMonitor({ scheduler, tickIntervalMs: 1000, topN: 10, onError: () => {} });

        await monitor.run();

        const calls = spy.mock.calls.filter((call) => call[0] === metrics.Types.ORCH_QUEUE_BACKPRESSURE);
        expect(calls).toHaveLength(0);
        spy.mockRestore();
    });
});

async function immediate(scheduler: Scheduler, props: { groupKey: string; groupMaxConcurrency: number }): Promise<Task> {
    return (
        await scheduler.immediate({
            name: nanoid(),
            payload: {},
            groupKey: props.groupKey,
            groupMaxConcurrency: props.groupMaxConcurrency,
            retryMax: 0,
            retryCount: 0,
            createdToStartedTimeoutSecs: 3600,
            startedToCompletedTimeoutSecs: 3600,
            heartbeatTimeoutSecs: 600,
            ownerKey: null,
            retryKey: null
        })
    ).unwrap();
}
