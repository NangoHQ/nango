import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import * as tasks from './tasks.js';
import { taskStates } from '../types.js';
import type { TaskState, Task } from '../types.js';
import { getTestDbClient } from '../db/helpers.test.js';
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
        const task = (
            await tasks.create(db, {
                name: 'Test Task',
                payload: { foo: 'bar' },
                groupKey: 'groupA',
                retryMax: 3,
                retryCount: 1,
                startsAfter: new Date(),
                createdToStartedTimeoutSecs: 10,
                startedToCompletedTimeoutSecs: 20,
                heartbeatTimeoutSecs: 5
            })
        ).unwrap();
        expect(task).toMatchObject({
            id: expect.any(String) as string,
            name: 'Test Task',
            payload: { foo: 'bar' },
            groupKey: 'groupA',
            retryMax: 3,
            retryCount: 1,
            startsAfter: expect.toBeIsoDateTimezone(),
            createdAt: expect.toBeIsoDateTimezone(),
            createdToStartedTimeoutSecs: 10,
            startedToCompletedTimeoutSecs: 20,
            state: 'CREATED',
            lastStateTransitionAt: expect.toBeIsoDateTimezone(),
            lastHeartbeatAt: expect.toBeIsoDateTimezone(),
            output: null,
            terminated: false
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
        const t0 = await createTask(db, { groupKey: 'A' });
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

        const l3 = (await tasks.search(db, { state: 'CREATED' })).unwrap();
        expect(l3.length).toBe(2);
        expect(l3.map((t) => t.id)).toStrictEqual([t2.id, t3.id]);

        const l4 = (await tasks.search(db, { state: 'CREATED', groupKey: 'unkown' })).unwrap();
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
    return tasks
        .create(db, {
            name: props?.name || rndString(),
            payload: props?.payload || {},
            groupKey: props?.groupKey || rndString(),
            retryMax: props?.retryMax || 3,
            retryCount: props?.retryCount || 1,
            startsAfter: props?.startsAfter || new Date(),
            createdToStartedTimeoutSecs: props?.createdToStartedTimeoutSecs || 10,
            startedToCompletedTimeoutSecs: props?.startedToCompletedTimeoutSecs || 20,
            heartbeatTimeoutSecs: props?.heartbeatTimeoutSecs || 5
        })
        .then((t) => t.unwrap());
}

async function startTask(db: knex.Knex, props?: Partial<tasks.TaskProps>): Promise<Task> {
    return createTask(db, props).then(async (t) => (await tasks.transitionState(db, { taskId: t.id, newState: 'STARTED' })).unwrap());
}

function rndString(): string {
    return (Math.random() + 1).toString(36).substring(2, 5);
}
