import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { defaultSchedulerConfig } from './config.js';
import { getTestDbClient } from './db/helpers.test.js';
import { Scheduler } from './scheduler.js';

import type { SchedulerConfig } from './config.js';
import type { Task } from './types.js';

describe('Scheduler controls', () => {
    const callbacks = {
        CREATED: vi.fn(),
        STARTED: vi.fn(),
        SUCCEEDED: vi.fn(),
        FAILED: vi.fn(),
        EXPIRED: vi.fn(),
        CANCELLED: vi.fn()
    };

    let dbClient: ReturnType<typeof getTestDbClient>;
    let scheduler: Scheduler | undefined;

    beforeEach(async () => {
        dbClient = getTestDbClient(uniqueSchemaName('scheduler_controls'));
        await dbClient.migrate();
    });

    afterEach(async () => {
        await scheduler?.stop();
        await dbClient.clearDatabase();
        await dbClient.destroy();

        callbacks.CREATED.mockReset();
        callbacks.STARTED.mockReset();
        callbacks.SUCCEEDED.mockReset();
        callbacks.FAILED.mockReset();
        callbacks.EXPIRED.mockReset();
        callbacks.CANCELLED.mockReset();
    });

    it('can start without the expiring daemon', async () => {
        scheduler = new Scheduler({ db: dbClient.db, on: callbacks, onError: () => {}, config: quickExpiringConfig() });
        scheduler.start({ scheduling: false, expiring: false, cleaning: false, backpressure: false });

        const task = await immediate(scheduler, { createdToStartedTimeoutSecs: 1 });

        await setTimeout(1200);

        const reloaded = (await scheduler.get({ taskId: task.id })).unwrap();
        expect(reloaded.state).toBe('CREATED');
        expect(callbacks.EXPIRED).not.toHaveBeenCalled();
    });

    it('always creates an abort task when a task expires', async () => {
        scheduler = new Scheduler({
            db: dbClient.db,
            on: callbacks,
            onError: () => {},
            config: quickExpiringConfig()
        });
        scheduler.start({ scheduling: false, cleaning: false, backpressure: false });

        const groupKey = nanoid();
        const task = await immediate(scheduler, { groupKey, createdToStartedTimeoutSecs: 1 });

        await waitForTaskState(scheduler, task.id, 'EXPIRED');
        const abortTask = await waitForAbortTask(scheduler, groupKey);

        const groupTasks = (await scheduler.searchTasks({ groupKey, limit: 10 })).unwrap();
        expect(groupTasks).toHaveLength(2);
        expect(groupTasks).toContainEqual(expect.objectContaining({ id: task.id }));
        expect(groupTasks).toContainEqual(expect.objectContaining({ id: abortTask.id, payload: expect.objectContaining({ type: 'abort' }) }));
        expect(callbacks.EXPIRED).toHaveBeenCalledOnce();
    });

    it('always creates an abort task when a task is cancelled', async () => {
        scheduler = new Scheduler({
            db: dbClient.db,
            on: callbacks,
            onError: () => {},
            config: quickExpiringConfig()
        });

        const groupKey = nanoid();
        const task = await immediate(scheduler, { groupKey });
        (await scheduler.dequeue({ groupKeyPattern: groupKey, limit: 1 })).unwrap();

        const cancelled = (await scheduler.cancel({ taskId: task.id, reason: 'cancelled by test' })).unwrap();

        const groupTasks = (await scheduler.searchTasks({ groupKey, limit: 10 })).unwrap();
        expect(cancelled.state).toBe('CANCELLED');
        expect(groupTasks).toHaveLength(2);
        expect(groupTasks).toContainEqual(expect.objectContaining({ id: task.id }));
        expect(groupTasks).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ type: 'abort' }) }));
        expect(callbacks.CANCELLED).toHaveBeenCalledOnce();
    });
});

function uniqueSchemaName(prefix: string): string {
    return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}

function quickExpiringConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
    return {
        ...defaultSchedulerConfig,
        ...overrides,
        daemons: {
            ...defaultSchedulerConfig.daemons,
            expiringTickIntervalMs: 25,
            ...overrides.daemons
        },
        limits: {
            ...defaultSchedulerConfig.limits,
            ...overrides.limits
        }
    };
}

async function immediate(scheduler: Scheduler, overrides: Partial<Parameters<Scheduler['immediate']>[0]> = {}): Promise<Task> {
    return (
        await scheduler.immediate({
            name: nanoid(),
            payload: {},
            groupKey: nanoid(),
            groupMaxConcurrency: 0,
            retryMax: 0,
            retryCount: 0,
            createdToStartedTimeoutSecs: 3600,
            startedToCompletedTimeoutSecs: 3600,
            heartbeatTimeoutSecs: 600,
            ownerKey: null,
            retryKey: null,
            ...overrides
        })
    ).unwrap();
}

async function waitForTaskState(scheduler: Scheduler, taskId: string, state: Task['state']): Promise<Task> {
    const started = Date.now();
    while (Date.now() - started < 3000) {
        const task = (await scheduler.get({ taskId })).unwrap();
        if (task.state === state) {
            return task;
        }
        await setTimeout(25);
    }

    const task = (await scheduler.get({ taskId })).unwrap();
    throw new Error(`Timed out waiting for task ${taskId} to reach ${state}; current state is ${task.state}`);
}

async function waitForAbortTask(scheduler: Scheduler, groupKey: string): Promise<Task> {
    const started = Date.now();
    while (Date.now() - started < 3000) {
        const tasks = (await scheduler.searchTasks({ groupKey, limit: 10 })).unwrap();
        const abortTask = tasks.find((task) => task.payload['type'] === 'abort');
        if (abortTask) {
            return abortTask;
        }
        await setTimeout(25);
    }

    throw new Error(`Timed out waiting for abort task in group ${groupKey}`);
}
