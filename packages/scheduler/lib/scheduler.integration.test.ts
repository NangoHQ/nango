import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { defaultSchedulerConfig } from './config.js';
import { getTestDbClient } from './db/helpers.test.js';
import { isDuplicateTaskNameError } from './errors.js';
import { Scheduler } from './scheduler.js';

import type { TaskProps } from './models/tasks.js';
import type { Schedule, ScheduleState, Task } from './types.js';

describe('Scheduler', () => {
    const dbClient = getTestDbClient();
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
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        const succeeded = (await scheduler.succeed({ taskId: task.id, output: { foo: 'bar' } })).unwrap();
        expect(succeeded.state).toBe('SUCCEEDED');
    });
    it('should retry failed task if max retries is not reached', async () => {
        const task = await immediate(scheduler, { taskProps: { retryMax: 2, retryCount: 1 } });
        await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 });
        (await scheduler.fail({ taskId: task.id, error: { message: 'failure happened' } })).unwrap();
        const retried = (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        expect(retried.length).toBe(1);
        expect(retried[0]?.retryKey).toBe(task.retryKey);
    });
    it('should not retry failed task if reached max retries', async () => {
        const task = await immediate(scheduler, { taskProps: { retryMax: 2, retryCount: 2 } });
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.fail({ taskId: task.id, error: { message: 'failure happened' } })).unwrap();
        const retried = (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        expect(retried.length).toBe(0);
    });
    it('should dequeue task', async () => {
        const task = await immediate(scheduler);
        const dequeued = (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        expect(dequeued.length).toBe(1);
    });
    it('should call callback when task is created', async () => {
        await immediate(scheduler);
        expect(callbacks.CREATED).toHaveBeenCalledOnce();
    });
    it('should return a duplicate-name error when an immediate task already exists', async () => {
        const name = `dup-${nanoid()}`;
        const groupKey = nanoid();

        await immediate(scheduler, { taskProps: { name, groupKey } });

        const duplicate = await scheduler.immediate({
            name,
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
        });

        expect(duplicate.isErr()).toBe(true);
        if (duplicate.isErr()) {
            expect(isDuplicateTaskNameError(duplicate.error)).toBe(true);
        }
        expect(callbacks.CREATED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is started', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        expect(callbacks.STARTED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is failed', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.fail({ taskId: task.id, error: { message: 'failure happened' } })).unwrap();
        expect(callbacks.FAILED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is succeeded', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.succeed({ taskId: task.id, output: { foo: 'bar' } })).unwrap();
        expect(callbacks.SUCCEEDED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is cancelled', async () => {
        const task = await immediate(scheduler);
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        (await scheduler.cancel({ taskId: task.id, reason: 'cancelled by user' })).unwrap();
        expect(callbacks.CANCELLED).toHaveBeenCalledOnce();
    });
    it('should call callback when task is expired', async () => {
        const timeoutMs = 1000;
        await immediate(scheduler, { taskProps: { createdToStartedTimeoutSecs: timeoutMs / 1000 } });
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + defaultSchedulerConfig.daemons.expiringTickIntervalMs));
        expect(callbacks.EXPIRED).toHaveBeenCalledOnce();
    });
    it('should monitor and expires created tasks if timeout is reached', async () => {
        const timeoutMs = 1000;
        const task = await immediate(scheduler, { taskProps: { createdToStartedTimeoutSecs: timeoutMs / 1000 } });
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + defaultSchedulerConfig.daemons.expiringTickIntervalMs));
        const [expired] = (await scheduler.searchTasks({ ids: [task.id] })).unwrap();
        expect(expired?.state).toBe('EXPIRED');
    });
    it('should monitor and expires started tasks if timeout is reached', async () => {
        const timeoutMs = 1000;
        const task = await immediate(scheduler, { taskProps: { startedToCompletedTimeoutSecs: timeoutMs / 1000 } });
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + defaultSchedulerConfig.daemons.expiringTickIntervalMs));
        const [taskAfter] = (await scheduler.searchTasks({ ids: [task.id] })).unwrap();
        expect(taskAfter?.state).toBe('EXPIRED');
    });
    it('should monitor and expires started tasks if heartbeat timeout is reached', async () => {
        const timeoutMs = 1000;
        const task = await immediate(scheduler, { taskProps: { heartbeatTimeoutSecs: timeoutMs / 1000 } });
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        await new Promise((resolve) => setTimeout(resolve, timeoutMs + defaultSchedulerConfig.daemons.expiringTickIntervalMs));
        const [taskAfter] = (await scheduler.searchTasks({ ids: [task.id] })).unwrap();
        expect(taskAfter?.state).toBe('EXPIRED');
    });
    it('should set schedule last scheduled task state', async () => {
        const schedule = await recurring({ scheduler });
        const task = await immediate(scheduler, { schedule });
        const [scheduleAfter] = (await scheduler.searchSchedules({ id: schedule.id, limit: 1 })).unwrap();
        expect(scheduleAfter?.lastScheduledTaskId).toBe(task.id);
    });
    it('should update last scheduled task when task is succeeded', async () => {
        const schedule = await recurring({ scheduler });
        const task = await immediate(scheduler, { schedule });
        const dequeued = (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        expect(dequeued.length).toBe(1);
        (await scheduler.succeed({ taskId: task.id, output: { foo: 'bar' } })).unwrap();
        const [scheduleAfter] = (await scheduler.searchSchedules({ id: schedule.id, limit: 1 })).unwrap();
        expect(scheduleAfter?.lastScheduledTaskId).toBe(task.id);
        expect(scheduleAfter?.lastScheduledTaskState).toBe('SUCCEEDED');
        expect(scheduleAfter?.nextExecutionAt).toEqual(new Date((scheduleAfter?.startsAt.getTime() || 0) + (scheduleAfter?.frequencyMs || 0)));
    });
    it('should update last scheduled task when task is failed', async () => {
        const schedule = await recurring({ scheduler });
        const task = await immediate(scheduler, { schedule });
        const dequeued = (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        expect(dequeued.length).toBe(1);
        (await scheduler.fail({ taskId: task.id, error: { message: 'failure happened' } })).unwrap();
        const [scheduleAfter] = (await scheduler.searchSchedules({ id: schedule.id, limit: 1 })).unwrap();
        expect(scheduleAfter?.lastScheduledTaskId).toBe(task.id);
        expect(scheduleAfter?.lastScheduledTaskState).toBe('FAILED');
        expect(scheduleAfter?.nextExecutionAt).toEqual(new Date((scheduleAfter?.startsAt.getTime() || 0) + (scheduleAfter?.frequencyMs || 0)));
    });
    it('should update last scheduled task when task is cancelled', async () => {
        const schedule = await recurring({ scheduler });
        const task = await immediate(scheduler, { schedule });
        const dequeued = (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        expect(dequeued.length).toBe(1);
        (await scheduler.cancel({ taskId: task.id, reason: 'cancelled by user' })).unwrap();
        const [scheduleAfter] = (await scheduler.searchSchedules({ id: schedule.id, limit: 1 })).unwrap();
        expect(scheduleAfter?.lastScheduledTaskId).toBe(task.id);
        expect(scheduleAfter?.lastScheduledTaskState).toBe('CANCELLED');
        expect(scheduleAfter?.nextExecutionAt).toEqual(new Date((scheduleAfter?.startsAt.getTime() || 0) + (scheduleAfter?.frequencyMs || 0)));
    });
    it('should override next execution when succeed is called with nextExecutionInMs', async () => {
        const schedule = await recurring({ scheduler });
        const task = await immediate(scheduler, { schedule });
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        const nextExecutionInMs = 9_999_999;
        (await scheduler.succeed({ taskId: task.id, output: {}, nextExecutionInMs })).unwrap();
        const [scheduleAfter] = (await scheduler.searchSchedules({ id: schedule.id, limit: 1 })).unwrap();
        expect(scheduleAfter?.nextExecutionAt).toBeWithinMs(new Date(Date.now() + nextExecutionInMs), 3_000);
    });
    it('should override next execution when fail is called with nextExecutionInMs', async () => {
        const schedule = await recurring({ scheduler });
        const task = await immediate(scheduler, { schedule });
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        const nextExecutionInMs = 9_999_999;
        (await scheduler.fail({ taskId: task.id, error: { message: 'failure' }, nextExecutionInMs })).unwrap();
        const [scheduleAfter] = (await scheduler.searchSchedules({ id: schedule.id, limit: 1 })).unwrap();
        expect(scheduleAfter?.nextExecutionAt).toBeWithinMs(new Date(Date.now() + nextExecutionInMs), 3_000);
    });
    it('should override next execution when cancel is called with nextExecutionInMs', async () => {
        const schedule = await recurring({ scheduler });
        const task = await immediate(scheduler, { schedule });
        (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
        const nextExecutionInMs = 9_999_999;
        (await scheduler.cancel({ taskId: task.id, reason: 'cancelled', nextExecutionInMs })).unwrap();
        const [scheduleAfter] = (await scheduler.searchSchedules({ id: schedule.id, limit: 1 })).unwrap();
        expect(scheduleAfter?.nextExecutionAt).toBeWithinMs(new Date(Date.now() + nextExecutionInMs), 3_000);
    });
    it('should not run an immediate task for a schedule if another task is already running', async () => {
        const schedule = await recurring({ scheduler });
        await immediate(scheduler, { schedule }); // first task: OK
        await expect(immediate(scheduler, { schedule })).rejects.toThrow();
    });
    it('should create an uncapped task when immediate is called for a schedule', async () => {
        const schedule = await recurring({ scheduler });
        const task = await immediate(scheduler, { schedule });
        expect(task.groupMaxConcurrency).toBe(0);
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
        const [task] = (await scheduler.searchTasks({ scheduleId: schedule.id })).unwrap();
        expect(task?.state).toBe('CANCELLED');
        expect(callbacks.CANCELLED).toHaveBeenCalledOnce();
        expect(deleted.lastScheduledTaskId).toBe(task?.id);
        expect(deleted.lastScheduledTaskState).toBe('CANCELLED');
    });
    it('should update schedule frequency', async () => {
        const schedule = await recurring({ scheduler });
        const newFrequency = 1_800_000;
        const updated = (await scheduler.setScheduleFrequency({ scheduleName: schedule.name, frequencyMs: newFrequency })).unwrap();
        expect(updated.frequencyMs).toBe(newFrequency);
        expect(updated.nextExecutionAt).toEqual(new Date(updated.startsAt.getTime() + newFrequency));
    });
    it('should search schedules by name', async () => {
        const schedule = await recurring({ scheduler });
        const found = (await scheduler.searchSchedules({ names: [schedule.name], limit: 1 })).unwrap();
        expect(found.length).toBe(1);
        expect(found[0]?.id).toBe(schedule.id);
    });

    describe('delayed', () => {
        it('should create a task in CREATED state with the given startsAfter', async () => {
            const startsAfter = new Date(Date.now() + 60_000);
            const task = await delayed(scheduler, { startsAfter });
            expect(task.state).toBe('CREATED');
            expect(task.startsAfter).toBeWithinMs(startsAfter, 1_000);
        });
        it('should not be dequeue-able before startsAfter', async () => {
            const task = await delayed(scheduler, { startsAfter: new Date(Date.now() + 60_000) });
            const dequeued = (await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap();
            expect(dequeued.length).toBe(0);
        });
        it('should become dequeue-able once startsAfter has passed', async () => {
            const delayMs = 1_000;
            const task = await delayed(scheduler, { startsAfter: new Date(Date.now() + delayMs) });
            expect((await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap().length).toBe(0);
            await new Promise((resolve) => setTimeout(resolve, delayMs + 300));
            expect((await scheduler.dequeue({ groupKeyPattern: task.groupKey, limit: 1 })).unwrap().length).toBe(1);
        });
    });

    describe('immediateBatch', () => {
        it('should create a batch of tasks', async () => {
            const groupKey = nanoid();
            const propsList = [batchProps({ groupKey }), batchProps({ groupKey }), batchProps({ groupKey })];
            const { created, discarded } = (await scheduler.immediateBatch(propsList)).unwrap();
            expect(created).toHaveLength(3);
            expect(created.map((t) => t.name).sort()).toEqual(propsList.map((p) => p.name).sort());
            expect(created.every((t) => t.state === 'CREATED')).toBe(true);
            expect(discarded).toEqual([]);
            expect(callbacks.CREATED).toHaveBeenCalledTimes(3);
        });
        it('should report a duplicate as discarded without failing the whole batch', async () => {
            const groupKey = nanoid();
            const existing = batchProps({ groupKey });
            (await scheduler.immediate(existing)).unwrap();
            callbacks.CREATED.mockReset();

            const newProp = batchProps({ groupKey });
            const { created, discarded } = (await scheduler.immediateBatch([existing, newProp])).unwrap();
            expect(created.map((t) => t.name)).toEqual([newProp.name]);
            expect(discarded.map((d) => ({ name: d.props.name, reason: d.reason }))).toEqual([{ name: existing.name, reason: 'duplicate' }]);
            expect(callbacks.CREATED).toHaveBeenCalledOnce();
        });
        it('should return empty created/discarded for an empty batch', async () => {
            const res = (await scheduler.immediateBatch([])).unwrap();
            expect(res).toEqual({ created: [], discarded: [] });
        });
    });

    it('should not propagate errors thrown by the onEvent handler', async () => {
        const throwingOnEvent = vi.fn(() => {
            throw new Error('error from onEvent');
        });
        const localScheduler = new Scheduler({
            db: dbClient.db,
            on: { CREATED: () => {}, STARTED: () => {}, SUCCEEDED: () => {}, FAILED: () => {}, EXPIRED: () => {}, CANCELLED: () => {} },
            onError: () => {},
            onEvent: throwingOnEvent,
            config: { ...defaultSchedulerConfig, limits: { ...defaultSchedulerConfig.limits, groupTaskCap: 1 } }
        });
        const groupKey = nanoid();
        await immediate(localScheduler, { taskProps: { groupKey } });

        // Second task in the same group exceeds groupTaskCap=1 -> Scheduler.immediate fires onEvent.
        // The handler throws; the Scheduler must isolate that throw and return a normal Err.
        const second = await localScheduler.immediate({
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
        });
        expect(throwingOnEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'task_dropped', groupKey }));
        expect(second.isErr()).toBe(true);
        if (second.isErr()) {
            expect(String(second.error)).not.toContain('error from onEvent');
        }
        await localScheduler.stop();
    });
});

function batchProps(overrides: Partial<TaskProps> = {}): Parameters<Scheduler['immediateBatch']>[0][number] {
    return {
        name: overrides.name || nanoid(),
        payload: overrides.payload || {},
        groupKey: overrides.groupKey || nanoid(),
        groupMaxConcurrency: overrides.groupMaxConcurrency ?? 0,
        retryMax: overrides.retryMax ?? 0,
        retryCount: overrides.retryCount ?? 0,
        createdToStartedTimeoutSecs: overrides.createdToStartedTimeoutSecs ?? 3600,
        startedToCompletedTimeoutSecs: overrides.startedToCompletedTimeoutSecs ?? 3600,
        heartbeatTimeoutSecs: overrides.heartbeatTimeoutSecs ?? 600,
        ownerKey: overrides.ownerKey ?? null,
        retryKey: overrides.retryKey ?? null
    };
}

async function delayed(
    scheduler: Scheduler,
    { startsAfter, taskProps }: { startsAfter: Date; taskProps?: Partial<Omit<TaskProps, 'startsAfter' | 'scheduleId'>> }
): Promise<Task> {
    return (
        await scheduler.delayed({
            name: taskProps?.name || nanoid(),
            payload: taskProps?.payload || {},
            groupKey: taskProps?.groupKey || nanoid(),
            groupMaxConcurrency: taskProps?.groupMaxConcurrency || 0,
            retryMax: taskProps?.retryMax ?? 1,
            retryCount: taskProps?.retryCount || 0,
            createdToStartedTimeoutSecs: taskProps?.createdToStartedTimeoutSecs || 3600,
            startedToCompletedTimeoutSecs: taskProps?.startedToCompletedTimeoutSecs || 3600,
            heartbeatTimeoutSecs: taskProps?.heartbeatTimeoutSecs || 600,
            ownerKey: taskProps?.ownerKey || null,
            retryKey: taskProps?.retryKey || null,
            startsAfter
        })
    ).unwrap();
}

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
        lastScheduledTaskId: null,
        lastScheduledTaskState: null
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
            scheduleName: props.schedule.name,
            extra: {}
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
