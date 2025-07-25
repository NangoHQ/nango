import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { getTestDbClient } from './db/helpers.test.js';
import { envs } from './env.js';
import * as tasks from './models/tasks.js';
import { Scheduler } from './scheduler.js';

import type { TaskProps } from './models/tasks.js';
import type { Schedule, ScheduleState, Task } from './types.js';

describe('Scheduler', () => {
    const dbClient = getTestDbClient();
    const db = dbClient.db;
    const callbacks = {
        CREATED: vi.fn((task: Task) => expect(task.state).toBe('CREATED')),
        STARTED: vi.fn((task: Task) => expect(task.state).toBe('STARTED')),
        SUCCEEDED: vi.fn((task: Task) => expect(task.state).toBe('SUCCEEDED')),
        FAILED: vi.fn((task: Task) => expect(task.state).toBe('FAILED')),
        EXPIRED: vi.fn((task: Task) => expect(task.state).toBe('EXPIRED')),
        CANCELLED: vi.fn((task: Task) => expect(task.state).toBe('CANCELLED'))
    };
    const scheduler = new Scheduler({ db: dbClient.db, on: callbacks, onError: () => {} });

    beforeAll(async () => {
        scheduler.start();
        await dbClient.migrate();
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
        await scheduler.stop();
        await dbClient.clearDatabase();
    });

    it('mark task as SUCCEEDED', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        const succeeded = (await scheduler.succeed({ taskId: task.id, output: { foo: 'bar' } })).unwrap();
        expect(succeeded.state).toBe('SUCCEEDED');
    });
    it('should retry failed task if max retries is not reached', async () => {
        const task = await immediate(scheduler, { taskProps: { retryMax: 2, retryCount: 1 } });
        await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 });
        (await scheduler.fail({ taskId: task.id, error: { message: 'failure happened' } })).unwrap();
        const retried = (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(retried.length).toBe(1);
        expect(retried[0]?.retryKey).toBe(task.retryKey);
    });
    it('should not retry failed task if reached max retries', async () => {
        const task = await immediate(scheduler, { taskProps: { retryMax: 2, retryCount: 2 } });
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.fail({ taskId: task.id, error: { message: 'failure happened' } })).unwrap();
        const retried = (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(retried.length).toBe(0);
    });
    it('should dequeue task', async () => {
        const task = await immediate(scheduler);
        const dequeued = (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(dequeued.length).toBe(1);
    });
    it('should call callback when task is created', async () => {
        await immediate(scheduler);
        expect(callbacks.CREATED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is started', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        expect(callbacks.STARTED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is failed', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.fail({ taskId: task.id, error: { message: 'failure happened' } })).unwrap();
        expect(callbacks.FAILED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is succeeded', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.succeed({ taskId: task.id, output: { foo: 'bar' } })).unwrap();
        expect(callbacks.SUCCEEDED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is cancelled', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.cancel({ taskId: task.id, reason: 'cancelled by user' })).unwrap();
        expect(callbacks.CANCELLED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is expired', async () => {
        const timeoutMs = 1000;
        await immediate(scheduler, { taskProps: { createdToStartedTimeoutSecs: timeoutMs / 1000 } });
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + envs.ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS));
        expect(callbacks.EXPIRED).toHaveBeenCalledOnce();
    });
    it('should monitor and expires created tasks if timeout is reached', async () => {
        const timeoutMs = 1000;
        const task = await immediate(scheduler, { taskProps: { createdToStartedTimeoutSecs: timeoutMs / 1000 } });
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + envs.ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS));
        const expired = (await tasks.get(db, task.id)).unwrap();
        expect(expired.state).toBe('EXPIRED');
    });
    it('should monitor and expires started tasks if timeout is reached', async () => {
        const timeoutMs = 1000;
        const task = await immediate(scheduler, { taskProps: { startedToCompletedTimeoutSecs: timeoutMs / 1000 } });
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + envs.ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS));
        const taskAfter = (await tasks.get(db, task.id)).unwrap();
        expect(taskAfter.state).toBe('EXPIRED');
    });
    it('should monitor and expires started tasks if heartbeat timeout is reached', async () => {
        const timeoutMs = 1000;
        const task = await immediate(scheduler, { taskProps: { heartbeatTimeoutSecs: timeoutMs / 1000 } });
        (await scheduler.dequeue({ groupKey: task.groupKey, limit: 1 })).unwrap();
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + envs.ORCHESTRATOR_EXPIRING_TICK_INTERVAL_MS));
        const taskAfter = (await tasks.get(db, task.id)).unwrap();
        expect(taskAfter.state).toBe('EXPIRED');
    });
    it('should not run an immediate task for a schedule if another task is already running', async () => {
        const schedule = await recurring({ scheduler });
        await immediate(scheduler, { schedule }); // first task: OK
        await expect(immediate(scheduler, { schedule })).rejects.toThrow();
    });
    it('should change schedule state', async () => {
        const paused = await recurring({ scheduler, state: 'PAUSED' });
        expect(paused.state).toBe('PAUSED');
        const unpaused = (await scheduler.setScheduleState({ scheduleName: paused.name, state: 'STARTED' })).unwrap();
        expect(unpaused.state).toBe('STARTED');
        const deleted = (await scheduler.setScheduleState({ scheduleName: unpaused.name, state: 'DELETED' })).unwrap();
        expect(deleted.state).toBe('DELETED');
        expect(deleted.deletedAt).not.toBe(null);
    });
    it('should cancel tasks if schedule is deleted', async () => {
        const schedule = await recurring({ scheduler });
        await immediate(scheduler, { schedule });
        const deleted = (await scheduler.setScheduleState({ scheduleName: schedule.name, state: 'DELETED' })).unwrap();
        expect(deleted.state).toBe('DELETED');
        const tasks = (await scheduler.searchTasks({ scheduleId: schedule.id })).unwrap();
        expect(tasks.length).toBe(1);
        expect(tasks[0]?.state).toBe('CANCELLED');
        expect(callbacks.CANCELLED).toHaveBeenCalledOnce();
    });
    it('should update schedule frequency', async () => {
        const schedule = await recurring({ scheduler });
        const newFrequency = 1_800_000;
        const updated = (await scheduler.setScheduleFrequency({ scheduleName: schedule.name, frequencyMs: newFrequency })).unwrap();
        expect(updated.frequencyMs).toBe(newFrequency);
    });
    it('should search schedules by name', async () => {
        const schedule = await recurring({ scheduler });
        const found = (await scheduler.searchSchedules({ names: [schedule.name], limit: 1 })).unwrap();
        expect(found.length).toBe(1);
        expect(found[0]?.id).toBe(schedule.id);
    });
});

async function recurring({ scheduler, state = 'PAUSED' }: { scheduler: Scheduler; state?: ScheduleState }): Promise<Schedule> {
    const recurringProps = {
        name: nanoid(),
        state,
        startsAt: new Date(),
        frequencyMs: 900_000,
        payload: { foo: 'bar' },
        groupKey: nanoid(),
        retryMax: 0,
        retryCount: 0,
        createdToStartedTimeoutSecs: 3600,
        startedToCompletedTimeoutSecs: 3600,
        heartbeatTimeoutSecs: 600,
        lastScheduledTaskId: null
    };
    return (await scheduler.recurring(recurringProps)).unwrap();
}

async function immediate(
    scheduler: Scheduler,
    props?:
        | {
              taskProps?: Partial<Omit<TaskProps, 'startsAfter'>>;
              scheduling?: 'immediate';
          }
        | { schedule: Schedule }
): Promise<Task> {
    let taskProps;
    if (props && 'schedule' in props) {
        taskProps = {
            scheduleName: props.schedule.name
        };
    } else {
        taskProps = {
            name: props?.taskProps?.name || nanoid(),
            payload: props?.taskProps?.payload || {},
            groupKey: props?.taskProps?.groupKey || nanoid(),
            groupMaxConcurrency: props?.taskProps?.groupMaxConcurrency || 0,
            retryMax: props?.taskProps?.retryMax || 1,
            retryCount: props?.taskProps?.retryCount || 0,
            createdToStartedTimeoutSecs: props?.taskProps?.createdToStartedTimeoutSecs || 3600,
            startedToCompletedTimeoutSecs: props?.taskProps?.startedToCompletedTimeoutSecs || 3600,
            heartbeatTimeoutSecs: props?.taskProps?.heartbeatTimeoutSecs || 600,
            ownerKey: props?.taskProps?.ownerKey || null,
            retryKey: props?.taskProps?.retryKey || null
        };
    }
    return (await scheduler.immediate(taskProps)).unwrap();
}
