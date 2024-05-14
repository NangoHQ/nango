import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { migrate } from '../db/migrate.js';
import { clearDb } from '../db/test.helpers.js';
import * as tasks from './tasks.js';
import { taskStates } from './tasks.js';
import type { TaskState, Task } from '../types.js';

describe('Task', () => {
    beforeAll(async () => {
        await migrate();
    });

    afterAll(async () => {
        await clearDb();
    });

    it('should be successfully created', async () => {
        const task = (
            await tasks.create({
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
        const t = await startTask();
        await new Promise((resolve) => void setTimeout(resolve, 20));
        const updated = (await tasks.heartbeat(t.id)).unwrap();
        expect(updated.lastHeartbeatAt.getTime()).toBeGreaterThan(t.lastHeartbeatAt.getTime());
    });
    it('should fail to transition to SUCCEEDED without an output', async () => {
        const t = await startTask();
        const updated = await tasks.transitionState({ taskId: t.id, newState: 'SUCCEEDED' });
        expect(updated.isErr()).toBe(true);
    });
    it('should transition between valid states and error when transitioning between invalid states', async () => {
        for (const from of taskStates) {
            for (const to of taskStates) {
                const t = await createTaskWithState(from);
                if (tasks.validTaskStateTransitions.find((v) => v.from === from && v.to === to)) {
                    // sleep to ensure lastStateTransitionAt is different from the previous state
                    await new Promise((resolve) => void setTimeout(resolve, 10));
                    const updated =
                        to === 'SUCCEEDED'
                            ? await tasks.transitionState({ taskId: t.id, newState: to, output: { foo: 'bar' } })
                            : await tasks.transitionState({ taskId: t.id, newState: to });
                    expect(updated.unwrap().state).toBe(to);
                    expect(updated.unwrap().lastStateTransitionAt.getTime()).toBeGreaterThan(t.lastStateTransitionAt.getTime());
                } else {
                    const updated = await tasks.transitionState({ taskId: t.id, newState: to });
                    expect(updated.isErr(), `transition from ${from} to ${to} failed`).toBe(true);
                }
            }
        }
    });
    it('should be dequeued', async () => {
        const t0 = await createTask({ groupKey: 'A' });
        const t1 = await createTask();
        const t2 = await createTask({ groupKey: t1.groupKey });
        await createTask({ groupKey: t0.groupKey });
        await createTask({ groupKey: t1.groupKey });

        let dequeued = (await tasks.dequeue({ groupKey: t1.groupKey, limit: 2 })).unwrap();
        expect(dequeued).toHaveLength(2);
        expect(dequeued[0]).toMatchObject({ id: t1.id, state: 'STARTED' });
        expect(dequeued[1]).toMatchObject({ id: t2.id, state: 'STARTED' });

        dequeued = (await tasks.dequeue({ groupKey: t1.groupKey, limit: 2 })).unwrap();
        expect(dequeued).toHaveLength(1); // only one task left

        dequeued = (await tasks.dequeue({ groupKey: t1.groupKey, limit: 1 })).unwrap();
        expect(dequeued).toHaveLength(0); // no tasks left
    });
    it('should not be dequeued if startsAfter is in the future', async () => {
        const tomorrow = (() => {
            const date = new Date();
            date.setDate(date.getDate() + 1);
            return date;
        })();
        const task = await createTask({
            startsAfter: tomorrow
        });
        const dequeued = (await tasks.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(dequeued).toHaveLength(0);
    });
    it('should expires tasks if createdToStartedTimeoutSecs is reached', async () => {
        const timeout = 1;
        await createTask({ createdToStartedTimeoutSecs: timeout });
        await new Promise((resolve) => void setTimeout(resolve, timeout * 1100));
        const expired = (await tasks.expiresIfTimeout()).unwrap();
        expect(expired).toHaveLength(1);
    });
    it('should expires tasks if startedToCompletedTimeoutSecs is reached', async () => {
        const timeout = 1;
        await startTask({ startedToCompletedTimeoutSecs: timeout });
        await new Promise((resolve) => void setTimeout(resolve, timeout * 1100));
        const expired = (await tasks.expiresIfTimeout()).unwrap();
        expect(expired).toHaveLength(1);
    });
    it('should expires tasks if heartbeatTimeoutSecs is reached', async () => {
        const timeout = 1;
        await startTask({ startedToCompletedTimeoutSecs: timeout });
        await new Promise((resolve) => void setTimeout(resolve, timeout * 1100));
        const expired = (await tasks.expiresIfTimeout()).unwrap();
        expect(expired).toHaveLength(1);
    });
});

async function createTaskWithState(state: TaskState): Promise<Task> {
    switch (state) {
        case 'CREATED':
            return createTask();
        case 'STARTED':
            return startTask();
        case 'FAILED':
            return startTask().then(async (t) => (await tasks.transitionState({ taskId: t.id, newState: 'FAILED' })).unwrap());
        case 'SUCCEEDED':
            return startTask().then(async (t) => (await tasks.transitionState({ taskId: t.id, newState: 'SUCCEEDED', output: { foo: 'bar' } })).unwrap());
        case 'EXPIRED':
            return startTask().then(async (t) => (await tasks.transitionState({ taskId: t.id, newState: 'EXPIRED' })).unwrap());
        case 'CANCELLED':
            return startTask().then(async (t) => (await tasks.transitionState({ taskId: t.id, newState: 'CANCELLED' })).unwrap());
    }
}

async function createTask(props?: Partial<tasks.TaskProps>): Promise<Task> {
    return tasks
        .create({
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

async function startTask(props?: Partial<tasks.TaskProps>): Promise<Task> {
    return createTask(props).then(async (t) => (await tasks.transitionState({ taskId: t.id, newState: 'STARTED' })).unwrap());
}

function rndString(): string {
    return (Math.random() + 1).toString(36).substring(2, 5);
}
