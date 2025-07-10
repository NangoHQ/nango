import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { nanoid } from '@nangohq/utils';

import * as tasks from './tasks.js';
import { getTestDbClient } from '../db/helpers.test.js';
import { taskStates } from '../types.js';

import type { Task, TaskState } from '../types.js';
import type { knex } from 'knex';

describe('Task', () => {
    const dbClient = getTestDbClient();
    const db = dbClient.db;
    beforeEach(async () => {
        await dbClient.migrate();
    });

    afterEach(async () => {
        await dbClient.clearDatabase();
    });

    it('should be successfully created', async () => {
        const props = {
            name: 'Test Task',
            payload: { foo: 'bar' },
            groupKey: nanoid(),
            groupMaxConcurrency: 0,
            retryMax: 3,
            retryCount: 1,
            startsAfter: new Date(),
            createdToStartedTimeoutSecs: 10,
            startedToCompletedTimeoutSecs: 20,
            heartbeatTimeoutSecs: 5,
            scheduleId: null,
            retryKey: '00000000-0000-0000-0000-000000000000',
            ownerKey: 'ownerA'
        };
        const task = (await tasks.create(db, props)).unwrap();
        expect(task).toMatchObject({
            id: expect.any(String),
            name: props.name,
            payload: props.payload,
            groupKey: props.groupKey,
            groupMaxConcurrency: props.groupMaxConcurrency,
            retryMax: props.retryMax,
            retryCount: props.retryCount,
            startsAfter: expect.toBeIsoDateTimezone(),
            createdAt: expect.toBeIsoDateTimezone(),
            createdToStartedTimeoutSecs: props.createdToStartedTimeoutSecs,
            startedToCompletedTimeoutSecs: props.startedToCompletedTimeoutSecs,
            state: 'CREATED',
            lastStateTransitionAt: expect.toBeIsoDateTimezone(),
            lastHeartbeatAt: expect.toBeIsoDateTimezone(),
            output: null,
            terminated: false,
            scheduleId: props.scheduleId,
            retryKey: props.retryKey,
            ownerKey: props.ownerKey
        });
    });
    it('should have their heartbeat updated', async () => {
        const t = await startTask(db);
        await new Promise((resolve) => void setTimeout(resolve, 20));
        const updated = (await tasks.heartbeat(db, t.id)).unwrap();
        expect(updated.lastHeartbeatAt.getTime()).toBeGreaterThan(t.lastHeartbeatAt.getTime());
    });
    it('should transition between valid states and error when transitioning between invalid states', async () => {
        const doTransition = async ({ taskId, newState }: { taskId: string; newState: TaskState }) => {
            return newState === 'CREATED' || newState === 'STARTED'
                ? await tasks.transitionState(db, { taskId, newState })
                : await tasks.transitionState(db, { taskId, newState, output: { foo: 'bar' } });
        };
        for (const from of taskStates) {
            for (const to of taskStates) {
                const t = await createTaskWithState(db, from);
                if (tasks.validTaskStateTransitions.find((v) => v.from === from && v.to === to)) {
                    // sleep to ensure lastStateTransitionAt is different from the previous state
                    await new Promise((resolve) => void setTimeout(resolve, 10));
                    const updated = await doTransition({ taskId: t.id, newState: to });
                    expect(updated.unwrap().state).toBe(to);
                    expect(updated.unwrap().lastStateTransitionAt.getTime()).toBeGreaterThan(t.lastStateTransitionAt.getTime());
                } else {
                    const updated = await doTransition({ taskId: t.id, newState: to });
                    expect(updated.isErr(), `transition from ${from} to ${to} failed`).toBe(true);
                }
            }
        }
    });
    it('should be dequeued', async () => {
        const t0 = await createTask(db, { groupKey: nanoid() });
        const t1 = await createTask(db);
        const t2 = await createTask(db, { groupKey: t1.groupKey });
        await createTask(db, { groupKey: t0.groupKey });
        await createTask(db, { groupKey: t1.groupKey });

        let dequeued = (await tasks.dequeue(db, { groupKey: t1.groupKey, limit: 2 })).unwrap();
        expect(dequeued).toHaveLength(2);
        expect(dequeued[0]).toMatchObject({ id: t1.id, state: 'STARTED' });
        expect(dequeued[1]).toMatchObject({ id: t2.id, state: 'STARTED' });

        dequeued = (await tasks.dequeue(db, { groupKey: t1.groupKey, limit: 2 })).unwrap();
        expect(dequeued).toHaveLength(1); // only one task left

        dequeued = (await tasks.dequeue(db, { groupKey: t1.groupKey, limit: 1 })).unwrap();
        expect(dequeued).toHaveLength(0); // no tasks left
    });
    it('should be dequeued by group key pattern', async () => {
        const t0 = await createTask(db, { groupKey: 'A:B:C' });
        const t1 = await createTask(db, { groupKey: 'A:B:D' });
        await createTask(db, { groupKey: 'A:X:Y' });
        await createTask(db, { groupKey: 'Z:A:B' });

        const dequeued = (await tasks.dequeue(db, { groupKey: 'A:B*', limit: 10 })).unwrap();
        expect(dequeued).toHaveLength(2);
        expect(dequeued[0]).toMatchObject({ id: t0.id, state: 'STARTED' });
        expect(dequeued[1]).toMatchObject({ id: t1.id, state: 'STARTED' });
    });
    it('should not be dequeued if startsAfter is in the future', async () => {
        const tomorrow = (() => {
            const date = new Date();
            date.setDate(date.getDate() + 1);
            return date;
        })();
        const task = await createTask(db, { startsAfter: tomorrow });
        const dequeued = (await tasks.dequeue(db, { groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(dequeued).toHaveLength(0);
    });
    it('should be dequeued according to group max concurrency ', async () => {
        const groupKey = nanoid();
        const groupMaxConcurrency = 2;
        const t0 = await createTask(db, { groupKey, groupMaxConcurrency });
        const t1 = await createTask(db, { groupKey, groupMaxConcurrency });

        let dequeued = (await tasks.dequeue(db, { groupKey, limit: 10 })).unwrap();
        expect(dequeued).toHaveLength(2);
        expect(dequeued[0]).toMatchObject({ id: t0.id, state: 'STARTED' });
        expect(dequeued[1]).toMatchObject({ id: t1.id, state: 'STARTED' });

        // group has reached its max concurrency, so no more tasks should be dequeued
        const t2 = await createTask(db, { groupKey, groupMaxConcurrency });
        dequeued = (await tasks.dequeue(db, { groupKey, limit: 10 })).unwrap();
        expect(dequeued).toHaveLength(0);

        // dequeuing tasks with different group key should not be affected
        const t3 = await createTask(db, { groupKey: nanoid(), groupMaxConcurrency });
        dequeued = (await tasks.dequeue(db, { groupKey: t3.groupKey, limit: 10 })).unwrap();
        expect(dequeued).toHaveLength(1);
        expect(dequeued[0]).toMatchObject({ id: t3.id, state: 'STARTED' });

        // tasks now completes
        await succeedTask(db, t0.id);
        await succeedTask(db, t1.id);

        // group should be able to dequeue again
        dequeued = (await tasks.dequeue(db, { groupKey, limit: 10 })).unwrap();
        expect(dequeued).toHaveLength(1);
        expect(dequeued[0]).toMatchObject({ id: t2.id, state: 'STARTED' });
    });
    it('should respect group max concurrency with parallel dequeue calls', async () => {
        const groupKey = nanoid();
        const groupMaxConcurrency = 2;

        // creating and dequeing tasks in parallel in a tight loop
        // to increase the chance of race conditions
        const createdPromises: Promise<Task>[] = [];
        const createInterval = setInterval(() => {
            createdPromises.push(createTask(db, { groupKey, groupMaxConcurrency }));
        }, 1);
        const dequeuePromises: Promise<Task[]>[] = [];
        const dequeueInterval = setInterval(() => {
            dequeuePromises.push(tasks.dequeue(db, { groupKey, limit: 100 }).then((d) => d.unwrap()));
        }, 1);

        await new Promise((resolve) => void setTimeout(resolve, 200));
        clearInterval(createInterval);
        clearInterval(dequeueInterval);

        const created = await Promise.all(createdPromises);
        const dequeued = (await Promise.all(dequeuePromises)).flat();

        expect(created.length).toBeGreaterThan(groupMaxConcurrency);
        expect(dequeued).toHaveLength(groupMaxConcurrency);
    });
    it('should expires tasks if createdToStartedTimeoutSecs is reached', async () => {
        const timeout = 1;
        await createTask(db, { createdToStartedTimeoutSecs: timeout });
        await new Promise((resolve) => void setTimeout(resolve, timeout * 1100));
        const expired = (await tasks.expiresIfTimeout(db)).unwrap();
        expect(expired).toHaveLength(1);
        expect(expired[0]?.output).toMatchObject({ reason: `createdToStartedTimeoutSecs_exceeded` });
    });
    it('should expires tasks if startedToCompletedTimeoutSecs is reached', async () => {
        const timeout = 1;
        await startTask(db, { startedToCompletedTimeoutSecs: timeout });
        await new Promise((resolve) => void setTimeout(resolve, timeout * 1100));
        const expired = (await tasks.expiresIfTimeout(db)).unwrap();
        expect(expired).toHaveLength(1);
        expect(expired[0]?.output).toMatchObject({ reason: `startedToCompletedTimeoutSecs_exceeded` });
    });
    it('should expires tasks if heartbeatTimeoutSecs is reached', async () => {
        const timeout = 1;
        await startTask(db, { heartbeatTimeoutSecs: timeout });
        await new Promise((resolve) => void setTimeout(resolve, timeout * 1100));
        const expired = (await tasks.expiresIfTimeout(db)).unwrap();
        expect(expired).toHaveLength(1);
        expect(expired[0]?.output).toMatchObject({ reason: `heartbeatTimeoutSecs_exceeded` });
    });
    it('should search tasks', async () => {
        const t1 = await createTaskWithState(db, 'STARTED');
        const t2 = await createTaskWithState(db, 'CREATED');
        const t3 = await createTaskWithState(db, 'CREATED');

        const l1 = (await tasks.search(db)).unwrap();
        expect(l1.length).toBe(3);

        const l2 = (await tasks.search(db, { groupKey: t1.groupKey })).unwrap();
        expect(l2.length).toBe(1);
        expect(l2.map((t) => t.id)).toStrictEqual([t1.id]);

        const l3 = (await tasks.search(db, { states: ['CREATED'] })).unwrap();
        expect(l3.length).toBe(2);
        expect(l3.map((t) => t.id)).toStrictEqual([t2.id, t3.id]);

        const l4 = (await tasks.search(db, { states: ['CREATED'], groupKey: 'unkown' })).unwrap();
        expect(l4.length).toBe(0);

        const l5 = (await tasks.search(db, { ids: [t1.id, t2.id] })).unwrap();
        expect(l5.length).toBe(2);
        expect(l5.map((t) => t.id)).toStrictEqual([t1.id, t2.id]);
    });
    it('should be successfully saving json output', async () => {
        const outputs = [1, 'one', true, null, ['a', 'b'], { a: 1, b: 2, s: 'two', arr: ['a', 'b'] }, [{ id: 'a' }, { id: 'b' }]];
        for (const output of outputs) {
            const task = await createTaskWithState(db, 'STARTED');
            (await tasks.transitionState(db, { taskId: task.id, newState: 'SUCCEEDED', output })).unwrap();
        }
    });
});

async function createTaskWithState(db: knex.Knex, state: TaskState): Promise<Task> {
    switch (state) {
        case 'CREATED':
            return createTask(db);
        case 'STARTED':
            return startTask(db);
        case 'FAILED':
            return startTask(db).then(async (t) => (await tasks.transitionState(db, { taskId: t.id, newState: 'FAILED', output: { foo: 'bar' } })).unwrap());
        case 'SUCCEEDED':
            return startTask(db).then(async (t) => (await tasks.transitionState(db, { taskId: t.id, newState: 'SUCCEEDED', output: { foo: 'bar' } })).unwrap());
        case 'EXPIRED':
            return startTask(db).then(async (t) =>
                (await tasks.transitionState(db, { taskId: t.id, newState: 'EXPIRED', output: { reason: `timeout_exceeded` } })).unwrap()
            );
        case 'CANCELLED':
            return startTask(db).then(async (t) =>
                (await tasks.transitionState(db, { taskId: t.id, newState: 'CANCELLED', output: { reason: 'cancelled_via_ui' } })).unwrap()
            );
    }
}

async function createTask(db: knex.Knex, props?: Partial<tasks.TaskProps>): Promise<Task> {
    const now = new Date();
    const task = await tasks.create(db, {
        name: props?.name || nanoid(),
        payload: props?.payload || {},
        groupKey: props?.groupKey || nanoid(),
        groupMaxConcurrency: props?.groupMaxConcurrency || 0,
        retryMax: props?.retryMax || 3,
        retryCount: props?.retryCount || 1,
        startsAfter: props?.startsAfter || now,
        createdToStartedTimeoutSecs: props?.createdToStartedTimeoutSecs || 10,
        startedToCompletedTimeoutSecs: props?.startedToCompletedTimeoutSecs || 20,
        heartbeatTimeoutSecs: props?.heartbeatTimeoutSecs || 5,
        scheduleId: props?.scheduleId || null,
        retryKey: props?.retryKey || null,
        ownerKey: props?.ownerKey || null
    });
    if (task.isErr()) {
        throw new Error(`Failed to create task: ${task.error.message}`);
    }
    return task.unwrap();
}

async function startTask(db: knex.Knex, props?: Partial<tasks.TaskProps>): Promise<Task> {
    return createTask(db, props).then(async (t) => (await tasks.transitionState(db, { taskId: t.id, newState: 'STARTED' })).unwrap());
}

async function succeedTask(db: knex.Knex, taskId: string): Promise<Task> {
    return tasks.transitionState(db, { taskId, newState: 'SUCCEEDED', output: true }).then((t) => t.unwrap());
}
