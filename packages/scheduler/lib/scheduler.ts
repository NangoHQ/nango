import { uuidv7 } from 'uuidv7';

import { Err, Ok, stringifyError } from '@nangohq/utils';

import { CleaningDaemon } from './daemons/cleaning/cleaning.daemon.js';
import { ExpiringDaemon } from './daemons/expiring/expiring.daemon.js';
import { SchedulingDaemon } from './daemons/scheduling/scheduling.daemon.js';
import * as schedules from './models/schedules.js';
import * as tasks from './models/tasks.js';
import { logger } from './utils/logger.js';

import type { ImmediateProps, Schedule, ScheduleProps, ScheduleState, Task, TaskState } from './types.js';
import type { Result } from '@nangohq/utils';
import type knex from 'knex';
import type { JsonObject, JsonValue } from 'type-fest';

export class Scheduler {
    private expiring: ExpiringDaemon;
    private scheduling: SchedulingDaemon;
    private cleaning: CleaningDaemon;
    private ac: AbortController;
    private onCallbacks: Record<TaskState, (task: Task) => void>;
    private db: knex.Knex;

    /**
     * Scheduler
     * @constructor
     * @param on - Callbacks for task state transitions
     * @returns Scheduler
     * @example
     * const scheduler = new Scheduler({
     *    on: {
     *        CREATED: (task: Task) => console.log(`Task ${task.id} created`),
     *        STARTED: (task: Task) => console.log(`Task ${task.id} started`),
     *        SUCCEEDED: (task: Task) => console.log(`Task ${task.id} succeeded`),
     *        FAILED: (task: Task) => console.log(`Task ${task.id} failed`),
     *        EXPIRED: (task: Task) => console.log(`Task ${task.id} expired`),
     *        CANCELLED: (task: Task) => console.log(`Task ${task.id} cancelled`)
     *    }
     * });
     */
    constructor({ db, on, onError }: { db: knex.Knex; on: Record<TaskState, (task: Task) => void>; onError: (err: Error) => void }) {
        this.ac = new AbortController();
        this.onCallbacks = on;
        this.db = db;

        this.expiring = new ExpiringDaemon({
            db,
            abortSignal: this.ac.signal,
            onExpiring: (task: Task) => {
                const { reason } = task.output as unknown as { reason?: string };
                this.scheduleAbortTask({ aborted: task, reason: `Execution expired: ${reason || 'unknown reason'}` });
                this.onCallbacks[task.state](task);
            },
            onError
        });
        this.scheduling = new SchedulingDaemon({
            db,
            abortSignal: this.ac.signal,
            onScheduling: (task: Task) => {
                this.onCallbacks[task.state](task);
            },
            onError
        });
        this.cleaning = new CleaningDaemon({ db, abortSignal: this.ac.signal, onError });
    }

    start(): void {
        // we don't await. Errors will be handled by the onError callback
        void this.expiring.start();
        void this.scheduling.start();
        void this.cleaning.start();
    }

    async stop(): Promise<void> {
        this.ac.abort();
        await this.cleaning.waitUntilStopped();
        await this.expiring.waitUntilStopped();
        await this.scheduling.waitUntilStopped();
    }

    /**
     * Get a task
     * @param taskId - Task ID
     * @example
     * const task = await scheduler.get({ taskId: '00000000-0000-0000-0000-000000000000' });
     */
    public async get({ taskId }: { taskId: string }): Promise<Result<Task>> {
        return tasks.get(this.db, taskId);
    }

    /**
     * Search tasks
     * @param params
     * @param params.ids - Task IDs
     * @param params.groupKey - Group key
     * @param params.state - Task state
     * @param params.scheduleId - Schedule ID
     * @param params.retryKey - Retry key
     * @param params.ownerKey - Owner key
     * @param params.limit - Limit
     * @example
     * const tasks = await scheduler.search({ groupKey: 'test', state: 'CREATED' });
     */
    public async searchTasks(params?: {
        ids?: string[];
        groupKey?: string;
        state?: TaskState;
        scheduleId?: string;
        retryKey?: string;
        ownerKey?: string;
        limit?: number;
    }): Promise<Result<Task[]>> {
        return tasks.search(this.db, params);
    }

    /**
     * Search schedules
     * @param params
     * @param params.names - Schedule names
     * @example
     * const tasks = await scheduler.searchSchedules({ names: ['scheduleA'] });
     */
    public async searchSchedules(params: {
        id?: string;
        names?: string[];
        state?: ScheduleState;
        limit: number;
        forUpdate?: boolean;
    }): Promise<Result<Schedule[]>> {
        return schedules.search(this.db, params);
    }

    /**
     * Schedule a task immediately
     * @param props - Scheduling properties or schedule name
     * @returns Task
     * @example
     * const schedulingProps = {
     *         name: 'myName',
     *         payload: {foo: 'bar'},
     *         groupKey: 'myGroupKey',
     *         retryMax: 1,
     *         retryCount: 0,
     *         createdToStartedTimeoutSecs: 1,
     *         startedToCompletedTimeoutSecs: 1,
     *         heartbeatTimeoutSecs: 1,
     *         groupMaxConcurrency: 1
     * };
     * const scheduled = await scheduler.immediate(schedulingProps);
     */
    public async immediate(props: ImmediateProps | { scheduleName: string }): Promise<Result<Task>> {
        return this.db.transaction(async (trx) => {
            const now = new Date();
            let taskProps: tasks.TaskProps;
            if ('scheduleName' in props) {
                // forUpdate = true so that the schedule is locked to prevent any concurrent update or concurrent scheduling of tasks
                const getSchedules = await schedules.search(trx, { names: [props.scheduleName], limit: 1, forUpdate: true });
                if (getSchedules.isErr()) {
                    return Err(getSchedules.error);
                }
                const schedule = getSchedules.value[0];
                if (!schedule) {
                    return Err(new Error(`Schedule '${props.scheduleName}' not found`));
                }
                // Not scheduling a task if another task for the same schedule is already running
                const running = await tasks.search(trx, {
                    scheduleId: schedule.id,
                    states: ['CREATED', 'STARTED']
                });
                if (running.isErr()) {
                    return Err(running.error);
                }
                if (running.value.length > 0) {
                    // TODO: identify this error so we can return something else than a 500
                    return Err(new Error(`Task for schedule '${props.scheduleName}' is already running: ${running.value[0]?.id}`));
                }
                taskProps = {
                    name: `${schedule.name}:${uuidv7()}`,
                    payload: schedule.payload,
                    groupKey: schedule.groupKey,
                    groupMaxConcurrency: 0,
                    retryMax: schedule.retryMax,
                    retryCount: 0,
                    createdToStartedTimeoutSecs: schedule.createdToStartedTimeoutSecs,
                    startedToCompletedTimeoutSecs: schedule.startedToCompletedTimeoutSecs,
                    heartbeatTimeoutSecs: schedule.heartbeatTimeoutSecs,
                    startsAfter: now,
                    scheduleId: schedule.id,
                    ownerKey: null
                };
            } else {
                taskProps = {
                    ...props,
                    startsAfter: now,
                    scheduleId: null
                };
            }

            const created = await tasks.create(trx, taskProps);
            if (created.isOk()) {
                const task = created.value;
                if (task.scheduleId) {
                    await schedules.update(trx, { id: task.scheduleId, lastScheduledTaskId: task.id });
                }
                this.onCallbacks[task.state](task);
            }
            return created;
        });
    }

    /**
     * Create a recurring schedule
     * @param props - Schedule properties
     * @returns Schedule
     * @example
     * const schedulingProps = {
     *    name: 'schedule-name',
     *    startsAt: new Date(),
     *    frequencyMs: 300_00,
     *    payload: {foo: 'bar'}
     *    groupKey: 'myGroupKey',
     *    retryMax: 1,
     *    retryCount: 0,
     *    createdToStartedTimeoutSecs: 1,
     *    startedToCompletedTimeoutSecs: 1,
     *    heartbeatTimeoutSecs: 1,
     * };
     * const schedule = await scheduler.recurring(schedulingProps);
     */
    public async recurring(props: ScheduleProps): Promise<Result<Schedule>> {
        return schedules.create(this.db, props);
    }

    /**
     * Dequeue tasks
     * @param groupKey - Group key or group key pattern (e.g. 'myGroupKey*')
     * @param limit - Limit
     * @returns Task[]
     * @example
     * const dequeued = await scheduler.dequeue({ groupKey: 'test', limit: 1 });
     */
    public async dequeue({ groupKey, limit }: { groupKey: string; limit: number }): Promise<Result<Task[]>> {
        const dequeued = await tasks.dequeue(this.db, { groupKey, limit });
        if (dequeued.isOk()) {
            dequeued.value.forEach((task) => this.onCallbacks[task.state](task));
        }
        return dequeued;
    }

    /**
     * Task Heartbeat
     * @param taskId - Task ID
     * @returns Task
     * @example
     * const heartbeat = await scheduler.heartbeat({ taskId: 'test' });
     */
    public async heartbeat({ taskId }: { taskId: string }): Promise<Result<Task>> {
        return tasks.heartbeat(this.db, taskId);
    }

    /**
     * Mark task as Succeeded
     * @param taskId - Task ID
     * @param output - Output
     * @returns Task
     * @example
     * const succeed = await scheduler.succeed({ taskId: '00000000-0000-0000-0000-000000000000', output: {foo: 'bar'} });
     */
    public async succeed({ taskId, output }: { taskId: string; output: JsonValue }): Promise<Result<Task>> {
        const succeeded = await tasks.transitionState(this.db, { taskId, newState: 'SUCCEEDED', output });
        if (succeeded.isOk()) {
            const task = succeeded.value;
            this.onCallbacks[task.state](task);
        }
        return succeeded;
    }

    /**
     * Fail a task
     * @param taskId - Task ID
     * @param error - Json object representing the error
     * @returns Task
     * @example
     * const failed = await scheduler.fail({ taskId: '00000000-0000-0000-0000-000000000000', error: {message: 'error'});
     */
    public async fail({ taskId, error }: { taskId: string; error: JsonValue }): Promise<Result<Task>> {
        return await this.db.transaction(async (trx) => {
            const task = await tasks.get(trx, taskId);
            if (task.isErr()) {
                return Err(`fail: Error fetching task '${taskId}': ${stringifyError(task.error)}`);
            }
            // if task is from a schedule,
            // lock the schedule to prevent concurrent update or scheduling of tasks
            // while we are potentially creating a new retry task
            if (task.value.scheduleId) {
                await schedules.search(trx, { id: task.value.scheduleId, limit: 1, forUpdate: true });
            }

            const failed = await tasks.transitionState(trx, { taskId, newState: 'FAILED', output: error });
            if (failed.isOk()) {
                const task = failed.value;
                this.onCallbacks[task.state](task);
                // Create a new task if the task is retryable
                if (task.retryMax > task.retryCount) {
                    const taskProps: ImmediateProps = {
                        name: `${task.name}:${task.retryCount + 1}`, // Append retry count to make it unique
                        payload: task.payload,
                        groupKey: task.groupKey,
                        groupMaxConcurrency: task.groupMaxConcurrency,
                        retryMax: task.retryMax,
                        retryCount: task.retryCount + 1,
                        createdToStartedTimeoutSecs: task.createdToStartedTimeoutSecs,
                        startedToCompletedTimeoutSecs: task.startedToCompletedTimeoutSecs,
                        heartbeatTimeoutSecs: task.heartbeatTimeoutSecs,
                        ownerKey: task.ownerKey,
                        retryKey: task.retryKey
                    };
                    const res = await this.immediate(taskProps);
                    if (res.isErr()) {
                        logger.error(`Error retrying task '${taskId}': ${stringifyError(res.error)}`);
                    }
                }
            }
            return failed;
        });
    }

    /**
     * Cancel a task
     * @param cancelBy - Cancel by task id
     * @param reason - Reason for cancellation
     * @returns Task
     * @example
     * const cancelled = await scheduler.cancel({ taskId: '00000000-0000-0000-0000-000000000000' });
     */
    public async cancel(cancelBy: { taskId: string; reason: JsonValue }): Promise<Result<Task>> {
        const cancelled = await tasks.transitionState(this.db, {
            taskId: cancelBy.taskId,
            newState: 'CANCELLED',
            output: { reason: cancelBy.reason }
        });
        if (cancelled.isOk()) {
            const task = cancelled.value;
            await this.scheduleAbortTask({ aborted: task, reason: `Execution was cancelled` });
            this.onCallbacks[task.state](task);
        }
        return cancelled;
    }

    /**
     * Set schedule state
     * @param scheduleName - Schedule name
     * @param state - Schedule state
     * @notes Cancels all running tasks if the schedule is paused or deleted
     * @returns Schedule
     * @example
     * const schedule = await scheduler.setScheduleState({ scheduleName: 'schedule123', state: 'PAUSED' });
     */
    public async setScheduleState({ scheduleName, state }: { scheduleName: string; state: ScheduleState }): Promise<Result<Schedule>> {
        return this.db.transaction(async (trx) => {
            // forUpdate = true so that the schedule is locked to prevent any concurrent update or concurrent scheduling of tasks
            const found = await schedules.search(trx, { names: [scheduleName], limit: 1, forUpdate: true });
            if (found.isErr()) {
                return Err(found.error);
            }
            if (!found.value[0]) {
                return Err(`Schedule '${scheduleName}' not found`);
            }
            const schedule = found.value[0];

            if (schedule.state === state) {
                // No-op if the schedule is already in the desired state
                return Ok(schedule);
            }

            const cancelledTasks = [];
            if (state === 'DELETED' || state === 'PAUSED') {
                const runningTasks = await tasks.search(trx, {
                    scheduleId: schedule.id,
                    states: ['CREATED', 'STARTED']
                });
                if (runningTasks.isErr()) {
                    return Err(`Error fetching tasks for schedule '${scheduleName}': ${stringifyError(runningTasks.error)}`);
                }
                for (const task of runningTasks.value) {
                    const t = await tasks.transitionState(trx, { taskId: task.id, newState: 'CANCELLED', output: { reason: `schedule ${state}` } });
                    if (t.isErr()) {
                        return Err(`Error cancelling task '${task.id}': ${stringifyError(t.error)}`);
                    }
                    cancelledTasks.push(t.value);
                }
            }

            const res = await schedules.transitionState(trx, schedule.id, state);
            if (res.isErr()) {
                return Err(`Error transitioning schedule '${scheduleName}': ${stringifyError(res.error)}`);
            }
            cancelledTasks.forEach((task) => this.onCallbacks[task.state](task));
            return res;
        });
    }

    /**
     * Set schedule frequency
     * @param scheduleName - Schedule name
     * @param frequencyMs - Frequency in milliseconds
     * @returns Schedule
     * @example
     * const schedule = await scheduler.setScheduleFrequency({ scheduleName: 'schedule123', frequencyMs: 600_000 });
     */
    public async setScheduleFrequency({ scheduleName, frequencyMs }: { scheduleName: string; frequencyMs: number }): Promise<Result<Schedule>> {
        return this.db.transaction(async (trx) => {
            const schedule = await schedules.search(trx, { names: [scheduleName], limit: 1 });
            if (schedule.isErr()) {
                return Err(schedule.error);
            }
            if (!schedule.value[0]) {
                return Err(`Schedule '${scheduleName}' not found`);
            }
            // No-op if the schedule is already in the desired frequency
            if (schedule.value[0].frequencyMs === frequencyMs) {
                return Ok(schedule.value[0]);
            }
            const res = await schedules.update(trx, { id: schedule.value[0].id, frequencyMs });
            if (res.isErr()) {
                return Err(`Error updating schedule frequency '${scheduleName}': ${stringifyError(res.error)}`);
            }
            return res;
        });
    }

    /**
     * Abort a task
     * @param aborted - Task to abort
     * @param reason - Reason for aborting
     * @returns Task
     * @example
     * const abortTask = await scheduler.abortTask({ aborted: task, reason: 'User requested' });
     */
    public async scheduleAbortTask({ aborted, reason }: { aborted: Task; reason: string }): Promise<Result<Task>> {
        const abortType = 'abort';

        // no need to abort an abort task
        const isAbortPayload = (payload: JsonValue) => {
            return typeof payload === 'object' && payload !== null && !Array.isArray(payload) && 'type' in payload && payload['type'] === abortType;
        };
        if (isAbortPayload(aborted.payload)) {
            return Err(`Task is already an abort task`);
        }

        const payload: JsonValue = {
            ...(aborted.payload as JsonObject),
            type: abortType,
            abortedTask: {
                id: aborted.id,
                state: aborted.state
            },
            reason
        };
        const abortTask = await this.immediate({
            name: `abort:${aborted.name}`,
            payload: payload,
            groupKey: aborted.groupKey,
            groupMaxConcurrency: aborted.groupMaxConcurrency,
            retryMax: 0,
            retryCount: 0,
            createdToStartedTimeoutSecs: 60,
            startedToCompletedTimeoutSecs: 60,
            heartbeatTimeoutSecs: 60,
            ownerKey: aborted.ownerKey
        });
        if (abortTask.isErr()) {
            logger.error(`Failed to create abort task`, abortTask.error);
            return Err(abortTask.error);
        }
        return abortTask;
    }
}
