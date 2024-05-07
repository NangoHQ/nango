import { expect, describe, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { migrate } from './db/migrate.js';
import { clearDb } from './db/test.helpers.js';
import { Scheduler } from './scheduler.js';
import type { Task } from './types.js';
import type { TaskProps } from './models/tasks.js';
import * as tasks from './models/tasks.js';

describe('Scheduler', () => {
    const callbacks = {
        CREATED: vi.fn((task: Task) => expect(task.state).toBe('CREATED')),
        STARTED: vi.fn((task: Task) => expect(task.state).toBe('STARTED')),
        SUCCEEDED: vi.fn((task: Task) => expect(task.state).toBe('SUCCEEDED')),
        FAILED: vi.fn((task: Task) => expect(task.state).toBe('FAILED')),
        EXPIRED: vi.fn((task: Task) => expect(task.state).toBe('EXPIRED')),
        CANCELLED: vi.fn((task: Task) => expect(task.state).toBe('CANCELLED'))
    };
    const scheduler = new Scheduler({ on: callbacks });

    beforeAll(async () => {
        await migrate();
    });

    afterEach(() => {
        callbacks.CREATED.mockReset();
        callbacks.STARTED.mockReset();
        callbacks.SUCCEEDED.mockReset();
        callbacks.FAILED.mockReset();
        callbacks.EXPIRED.mockReset();
        callbacks.CANCELLED.mockReset();
    });

    afterAll(async () => {
        scheduler.stop();
        await clearDb();
    });

    it('mark task as SUCCEEDED', async () => {
        const task = await scheduleTask(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        const succeeded = (await scheduler.succeed({ taskId: task.id, output: { foo: 'bar' } })).unwrap();
        expect(succeeded.state).toBe('SUCCEEDED');
    });
    it('should retry failed task if max retris is not reached', async () => {
        const task = await scheduleTask(scheduler, { taskProps: { retryMax: 2, retryCount: 1 } });
        await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 });
        (await scheduler.fail({ taskId: task.id })).unwrap();
        const retried = (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(retried.length).toBe(1);
    });
    it('should not retry failed task if reached max retries', async () => {
        const task = await scheduleTask(scheduler, { taskProps: { retryMax: 2, retryCount: 2 } });
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.fail({ taskId: task.id })).unwrap();
        const retried = (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(retried.length).toBe(0);
    });
    it('dequeue task', async () => {
        const task = await scheduleTask(scheduler);
        const dequeued = (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(dequeued.length).toBe(1);
    });
    it('call callback when task is created', async () => {
        await scheduleTask(scheduler);
        expect(callbacks.CREATED).toHaveBeenCalledOnce();
    });
    it('call callback when task is started', async () => {
        const task = await scheduleTask(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(callbacks.STARTED).toHaveBeenCalledOnce();
    });
    it('call callback when task is failed', async () => {
        const task = await scheduleTask(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.fail({ taskId: task.id })).unwrap();
        expect(callbacks.FAILED).toHaveBeenCalledOnce();
    });
    it('call callback when task is succeeded', async () => {
        const task = await scheduleTask(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.succeed({ taskId: task.id, output: { foo: 'bar' } })).unwrap();
        expect(callbacks.SUCCEEDED).toHaveBeenCalledOnce();
    });
    it('call callback when task is cancelled', async () => {
        const task = await scheduleTask(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.cancel({ taskId: task.id })).unwrap();
        expect(callbacks.CANCELLED).toHaveBeenCalledOnce();
    });
    it('call callback when task is expired', async () => {
        const timeout = 1;
        await scheduleTask(scheduler, { taskProps: { createdToStartedTimeoutSecs: timeout } });
        await new Promise((resolve) => setTimeout(resolve, timeout * 1500));
        expect(callbacks.EXPIRED).toHaveBeenCalledOnce();
    });
    it('monitor and expires created tasks if timeout is reached', async () => {
        const timeout = 1;
        const task = await scheduleTask(scheduler, { taskProps: { createdToStartedTimeoutSecs: timeout } });
        await new Promise((resolve) => setTimeout(resolve, timeout * 1500));
        const expired = (await tasks.get(task.id)).unwrap();
        expect(expired.state).toBe('EXPIRED');
    });
    it('monitor and expires started tasks if timeout is reached', async () => {
        const timeout = 1;
        const task = await scheduleTask(scheduler, { taskProps: { startedToCompletedTimeoutSecs: timeout } });
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        await new Promise((resolve) => setTimeout(resolve, timeout * 1500));
        const taskAfter = (await tasks.get(task.id)).unwrap();
        expect(taskAfter.state).toBe('EXPIRED');
    });
    it('monitor and expires started tasks if heartbeat timeout is reached', async () => {
        const timeout = 1;
        const task = await scheduleTask(scheduler, { taskProps: { heartbeatTimeoutSecs: timeout } });
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        await new Promise((resolve) => setTimeout(resolve, timeout * 1500));
        const taskAfter = (await tasks.get(task.id)).unwrap();
        expect(taskAfter.state).toBe('EXPIRED');
    });
});

async function scheduleTask(
    scheduler: Scheduler,
    props?: {
        taskProps?: Partial<Omit<TaskProps, 'startsAfter'>>;
        scheduling?: 'immediate';
    }
): Promise<Task> {
    const taskProps = {
        name: props?.taskProps?.name || 'test',
        payload: props?.taskProps?.payload || {},
        groupKey: props?.taskProps?.groupKey || (Math.random() + 1).toString(36).substring(2, 5),
        retryMax: props?.taskProps?.retryMax || 1,
        retryCount: props?.taskProps?.retryCount || 0,
        createdToStartedTimeoutSecs: props?.taskProps?.createdToStartedTimeoutSecs || 3600,
        startedToCompletedTimeoutSecs: props?.taskProps?.startedToCompletedTimeoutSecs || 3600,
        heartbeatTimeoutSecs: props?.taskProps?.heartbeatTimeoutSecs || 600
    };
    const scheduling = props?.scheduling || 'immediate';
    return (await scheduler.schedule({ taskProps, scheduling })).unwrap();
}
