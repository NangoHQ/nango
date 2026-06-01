import { setTimeout } from 'node:timers/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DatabaseClient, defaultSchedulerConfig } from '@nangohq/scheduler';
import { Ok, nanoid } from '@nangohq/utils';

import { TaskQueue } from './tasks.js';
import { defineTask } from './types.js';

const dbUrl = `postgres://${process.env['NANGO_DB_USER']}:${process.env['NANGO_DB_PASSWORD']}@${process.env['NANGO_DB_HOST']}:${process.env['NANGO_DB_PORT']}/${process.env['NANGO_DB_NAME']}`;

// Short tick intervals so the processor picks tasks up quickly and the daemons shut down promptly.
const FAST_TICK_MS = 50;
const fastConfig = {
    ...defaultSchedulerConfig,
    daemons: {
        ...defaultSchedulerConfig.daemons,
        schedulingTickIntervalMs: FAST_TICK_MS,
        expiringTickIntervalMs: FAST_TICK_MS,
        cleaningTickIntervalMs: FAST_TICK_MS
    }
};

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error('timed out waiting for condition');
        }
        await setTimeout(25);
    }
}

describe('TaskQueue', () => {
    const schema = `nango_tasks_test_${nanoid().toLowerCase()}`;
    const handled: { message: string; attempt: number }[] = [];

    // Concurrency probe: tracks the max number of handlers running at once, overall and per bucket.
    let running = 0;
    let maxConcurrent = 0;
    let done = 0;

    const recordingTask = defineTask({
        type: 'recording',
        schema: z.object({ message: z.string() }),
        handle: (payload, ctx) => {
            handled.push({ message: payload.message, attempt: ctx.attempt });
            return Promise.resolve(Ok(undefined));
        }
    });

    // groupKey derived from the payload -> one concurrency bucket per connection, same handler.
    const syncTask = defineTask({
        type: 'sync',
        schema: z.object({ connectionId: z.string() }),
        groupKey: (payload) => `sync:${payload.connectionId}`,
        groupMaxConcurrency: 1,
        handle: async () => {
            running++;
            maxConcurrent = Math.max(maxConcurrent, running);
            await setTimeout(150);
            running--;
            done++;
            return Ok(undefined);
        }
    });

    let taskQueue: TaskQueue<readonly [typeof recordingTask, typeof syncTask]>;

    beforeAll(async () => {
        taskQueue = new TaskQueue({
            definitions: [recordingTask, syncTask] as const,
            dbUrl,
            dbSchema: schema,
            schedulerConfig: fastConfig,
            processorPollIntervalMs: FAST_TICK_MS,
            processorMaxConcurrency: 10
        });
        await taskQueue.migrate();
        taskQueue.start();
    });

    afterAll(async () => {
        await taskQueue.stop();
        const cleanup = new DatabaseClient({
            url: dbUrl,
            schema,
            poolMin: 1,
            poolMax: 1,
            ssl: false,
            applicationName: 'tasks-test',
            statementTimeoutMs: 60_000
        });
        await cleanup.db.raw(`DROP SCHEMA IF EXISTS ?? CASCADE`, [schema]);
        await cleanup.destroy();
    });

    beforeEach(() => {
        handled.length = 0;
        running = 0;
        maxConcurrent = 0;
        done = 0;
    });

    it('runs an immediately-enqueued task through its handler', async () => {
        const res = await taskQueue.enqueue('recording', { message: 'hello' });
        expect(res.isOk()).toBe(true);

        await waitFor(() => handled.length === 1);
        expect(handled[0]).toEqual({ message: 'hello', attempt: 0 });
    });

    it('does not run a delayed task before its startsAfter', async () => {
        const res = await taskQueue.enqueue('recording', { message: 'later' }, { startsAfter: new Date(Date.now() + 60_000) });
        expect(res.isOk()).toBe(true);

        // Several poll cycles (FAST_TICK_MS each) must pass without the task being picked up.
        await setTimeout(FAST_TICK_MS * 6);
        expect(handled).toHaveLength(0);
    });

    it('serializes tasks sharing a payload-derived groupKey (one per connection)', async () => {
        await Promise.all([
            taskQueue.enqueue('sync', { connectionId: 'conn_A' }),
            taskQueue.enqueue('sync', { connectionId: 'conn_A' }),
            taskQueue.enqueue('sync', { connectionId: 'conn_A' })
        ]);

        await waitFor(() => done === 3);
        expect(maxConcurrent).toBe(1); // groupMaxConcurrency: 1 within the same bucket
    });

    it('runs tasks in different groupKey buckets in parallel', async () => {
        await Promise.all([
            taskQueue.enqueue('sync', { connectionId: 'conn_X' }),
            taskQueue.enqueue('sync', { connectionId: 'conn_Y' }),
            taskQueue.enqueue('sync', { connectionId: 'conn_Z' })
        ]);

        await waitFor(() => done === 3);
        expect(maxConcurrent).toBeGreaterThanOrEqual(2); // distinct buckets are not serialized
    });

    it('enqueues a batch of mixed types in one call', async () => {
        const res = await taskQueue.enqueueBatch([
            { type: 'recording', payload: { message: 'batch-a' } },
            { type: 'recording', payload: { message: 'batch-b' } },
            { type: 'sync', payload: { connectionId: 'conn_batch' } }
        ]);

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value.created).toHaveLength(3);
            expect(res.value.discarded).toHaveLength(0);
        }

        await waitFor(() => handled.some((h) => h.message === 'batch-a') && handled.some((h) => h.message === 'batch-b') && done === 1);
    });

    it('returns ok with empty results for an empty batch', async () => {
        const res = await taskQueue.enqueueBatch([]);
        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value.created).toHaveLength(0);
        }
    });

    it('rejects the whole batch (enqueues nothing) if any item payload is invalid', async () => {
        const res = await taskQueue.enqueueBatch([
            { type: 'recording', payload: { message: 'valid-in-bad-batch' } },
            // @ts-expect-error - message must be a string
            { type: 'recording', payload: { message: 123 } }
        ]);

        expect(res.isErr()).toBe(true);
        await setTimeout(FAST_TICK_MS * 4);
        expect(handled.some((h) => h.message === 'valid-in-bad-batch')).toBe(false);
    });
});
