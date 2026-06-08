import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { defaultSchedulerConfig } from './config.js';
import { getTestDbClient } from './db/helpers.test.js';
import { Scheduler } from './scheduler.js';
import { SchedulerWorker } from './worker.js';

import type { Task } from './types.js';
import type { SchedulerWorkerErrorContext } from './worker.js';

describe('SchedulerWorker', () => {
    const callbacks = {
        CREATED: vi.fn(),
        STARTED: vi.fn(),
        SUCCEEDED: vi.fn(),
        FAILED: vi.fn(),
        EXPIRED: vi.fn(),
        CANCELLED: vi.fn()
    };

    let dbClient: ReturnType<typeof getTestDbClient>;
    let scheduler: Scheduler;
    let worker: SchedulerWorker | undefined;

    beforeEach(async () => {
        dbClient = getTestDbClient(uniqueSchemaName('scheduler_worker'));
        scheduler = new Scheduler({ db: dbClient.db, on: callbacks, onError: () => {}, config: defaultSchedulerConfig });
        await dbClient.migrate();
    });

    afterEach(async () => {
        await worker?.stop();
        await scheduler.stop();
        await dbClient.clearDatabase();
        await dbClient.destroy();
        vi.restoreAllMocks();

        callbacks.CREATED.mockReset();
        callbacks.STARTED.mockReset();
        callbacks.SUCCEEDED.mockReset();
        callbacks.FAILED.mockReset();
        callbacks.EXPIRED.mockReset();
        callbacks.CANCELLED.mockReset();
    });

    it('dequeues matching tasks and marks them as succeeded', async () => {
        const groupKey = nanoid();
        const task = await immediate(scheduler, { groupKey });

        worker = new SchedulerWorker({
            scheduler,
            pollIntervalMs: 20,
            handlers: [
                {
                    groupKeyPattern: groupKey,
                    limit: 1,
                    handle: (started) => {
                        expect(started.id).toBe(task.id);
                        expect(started.state).toBe('STARTED');
                        return Promise.resolve({ output: { ok: true } });
                    }
                }
            ]
        });
        worker.start();

        const succeeded = await waitForTaskState(scheduler, task.id, 'SUCCEEDED');

        expect(succeeded.output).toEqual({ ok: true });
        expect(callbacks.STARTED).toHaveBeenCalledOnce();
        expect(callbacks.SUCCEEDED).toHaveBeenCalledOnce();
    });

    it('marks handled task failures as failed', async () => {
        const groupKey = nanoid();
        const task = await immediate(scheduler, { groupKey });
        const onError = vi.fn<(err: Error, context: SchedulerWorkerErrorContext) => void>();

        worker = new SchedulerWorker({
            scheduler,
            pollIntervalMs: 20,
            onError,
            handlers: [
                {
                    groupKeyPattern: groupKey,
                    limit: 1,
                    handle: () => Promise.reject(new Error('worker failed'))
                }
            ]
        });
        worker.start();

        const failed = await waitForTaskState(scheduler, task.id, 'FAILED');

        expect(failed.output).toEqual({ message: 'worker failed' });
        expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ phase: 'handle', task: expect.objectContaining({ id: task.id }) }));
        expect(callbacks.FAILED).toHaveBeenCalledOnce();
    });

    it('uses custom failure output when a handler throws', async () => {
        const groupKey = nanoid();
        const task = await immediate(scheduler, { groupKey });

        worker = new SchedulerWorker({
            scheduler,
            pollIntervalMs: 20,
            handlers: [
                {
                    groupKeyPattern: groupKey,
                    limit: 1,
                    toFailureOutput: (err) => ({
                        code: 'custom_failure',
                        message: err instanceof Error ? err.message : 'unknown'
                    }),
                    handle: () => Promise.reject(new Error('typed failure'))
                }
            ]
        });
        worker.start();

        const failed = await waitForTaskState(scheduler, task.id, 'FAILED');

        expect(failed.output).toEqual({ code: 'custom_failure', message: 'typed failure' });
    });

    it('heartbeats while a task is running', async () => {
        const groupKey = nanoid();
        const task = await immediate(scheduler, { groupKey });
        const heartbeat = vi.spyOn(scheduler, 'heartbeat');

        worker = new SchedulerWorker({
            scheduler,
            pollIntervalMs: 20,
            handlers: [
                {
                    groupKeyPattern: groupKey,
                    limit: 1,
                    heartbeatIntervalMs: 30,
                    handle: async () => {
                        await setTimeout(120);
                        return { output: { ok: true } };
                    }
                }
            ]
        });
        worker.start();

        await waitForTaskState(scheduler, task.id, 'SUCCEEDED');

        expect(heartbeat).toHaveBeenCalledWith({ taskId: task.id });
    });

    it('routes abort tasks to handleAbort', async () => {
        const groupKey = nanoid();
        const task = await immediate(scheduler, { groupKey });
        (await scheduler.cancel({ taskId: task.id, reason: 'cancelled by test' })).unwrap();
        const abortTask = await waitForAbortTask(scheduler, groupKey);
        const handle = vi.fn(() => Promise.resolve({ output: { regular: true } }));
        const handleAbort = vi.fn(() => Promise.resolve({ output: { aborted: true } }));

        worker = new SchedulerWorker({
            scheduler,
            pollIntervalMs: 20,
            handlers: [
                {
                    groupKeyPattern: groupKey,
                    limit: 1,
                    handle,
                    handleAbort
                }
            ]
        });
        worker.start();

        const succeeded = await waitForTaskState(scheduler, abortTask.id, 'SUCCEEDED');

        expect(succeeded.output).toEqual({ aborted: true });
        expect(handle).not.toHaveBeenCalled();
        expect(handleAbort).toHaveBeenCalledWith(expect.objectContaining({ id: abortTask.id }));
    });

    it('completes abort tasks when no handleAbort is registered', async () => {
        const groupKey = nanoid();
        const task = await immediate(scheduler, { groupKey });
        (await scheduler.cancel({ taskId: task.id, reason: 'cancelled by test' })).unwrap();
        const abortTask = await waitForAbortTask(scheduler, groupKey);
        const handle = vi.fn(() => Promise.resolve({ output: { regular: true } }));

        worker = new SchedulerWorker({
            scheduler,
            pollIntervalMs: 20,
            handlers: [
                {
                    groupKeyPattern: groupKey,
                    limit: 1,
                    handle
                }
            ]
        });
        worker.start();

        const succeeded = await waitForTaskState(scheduler, abortTask.id, 'SUCCEEDED');

        expect(succeeded.output).toBeNull();
        expect(handle).not.toHaveBeenCalled();
    });

    it('stops polling when stopped', async () => {
        const dequeue = vi.spyOn(scheduler, 'dequeue');
        worker = new SchedulerWorker({
            scheduler,
            pollIntervalMs: 20,
            handlers: [
                {
                    groupKeyPattern: nanoid(),
                    limit: 1,
                    handle: () => Promise.resolve({ output: {} })
                }
            ]
        });

        worker.start();
        await waitFor(() => dequeue.mock.calls.length > 0);
        await worker.stop();

        const callCountAfterStop = dequeue.mock.calls.length;
        await setTimeout(80);

        expect(dequeue).toHaveBeenCalledTimes(callCountAfterStop);
    });
});

function uniqueSchemaName(prefix: string): string {
    return `${prefix}_${randomUUID().replaceAll('-', '')}`;
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
    let lastTask: Task | undefined;
    await waitFor(async () => {
        lastTask = (await scheduler.get({ taskId })).unwrap();
        return lastTask.state === state;
    }, `Timed out waiting for task ${taskId} to reach ${state}`);

    return lastTask!;
}

async function waitForAbortTask(scheduler: Scheduler, groupKey: string): Promise<Task> {
    let abortTask: Task | undefined;
    await waitFor(async () => {
        const tasks = (await scheduler.searchTasks({ groupKey, limit: 10 })).unwrap();
        abortTask = tasks.find((task) => task.payload['type'] === 'abort');
        return abortTask !== undefined;
    }, `Timed out waiting for abort task in group ${groupKey}`);

    return abortTask!;
}

async function waitFor(predicate: () => boolean | Promise<boolean>, message = 'Timed out waiting for predicate'): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < 3000) {
        if (await predicate()) {
            return;
        }
        await setTimeout(25);
    }

    throw new Error(message);
}
