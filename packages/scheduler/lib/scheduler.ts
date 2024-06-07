import { isMainThread } from 'node:worker_threads';
import type { JsonValue } from 'type-fest';
import type { Task, TaskState, Schedule, ScheduleProps, ImmediateProps } from './types';
import * as tasks from './models/tasks.js';
import * as schedules from './models/schedules.js';
import type { Result } from '@nangohq/utils';
import { Err, stringifyError } from '@nangohq/utils';
import { MonitorWorker } from './workers/monitor/monitor.worker.js';
import { SchedulingWorker } from './workers/scheduling/scheduling.worker.js';
import type { DatabaseClient } from './db/client.js';
import { logger } from './utils/logger.js';
import { uuidv7 } from 'uuidv7';

export class Scheduler {
    private monitor: MonitorWorker | null = null;
    private scheduling: SchedulingWorker | null = null;
    private onCallbacks: Record<TaskState, (task: Task) => void>;
    private dbClient: DatabaseClient;

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
    constructor({ dbClient, on }: { dbClient: DatabaseClient; on: Record<TaskState, (task: Task) => void> }) {
        if (isMainThread) {
            this.onCallbacks = on;
            this.dbClient = dbClient;
            this.monitor = new MonitorWorker({ databaseUrl: dbClient.url, databaseSchema: dbClient.schema });
            this.monitor.on(async (message) => {
                const { ids } = message;
                for (const taskId of ids) {
                    const fetched = await tasks.get(this.dbClient.db, taskId);
                    if (fetched.isOk()) {
                        const task = fetched.value;
                        this.onCallbacks[task.state](task);
                    }
                }
            });
            this.monitor.start();
            this.scheduling = new SchedulingWorker({ databaseUrl: dbClient.url, databaseSchema: dbClient.schema });
            // TODO: ensure there is only one instance of the scheduler
            this.scheduling.start();
        } else {
            throw new Error('Scheduler must be instantiated in the main thread');
        }
    }

    stop(): void {
        this.monitor?.stop();
        this.scheduling?.stop();
    }

    /**
     * Get a task
     * @param taskId - Task ID
     * @example
     * const task = await scheduler.get({ taskId: '00000000-0000-0000-0000-000000000000' });
     */
    public async get({ taskId }: { taskId: string }): Promise<Result<Task>> {
        return tasks.get(this.dbClient.db, taskId);
    }

    /**
     * Search tasks
     * @param params
     * @param params.ids - Task IDs
     * @param params.groupKey - Group key
     * @param params.state - Task state
     * @example
     * const tasks = await scheduler.search({ groupKey: 'test', state: 'CREATED' });
     */
    public async search(params?: { ids?: string[]; groupKey?: string; state?: TaskState; limit?: number }): Promise<Result<Task[]>> {
        return tasks.search(this.dbClient.db, params);
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
     *         heartbeatTimeoutSecs: 1
     * };
     * const scheduled = await scheduler.immediate(schedulingProps);
     */
    public async immediate(props: ImmediateProps | { scheduleName: string }): Promise<Result<Task>> {
        let taskProps: tasks.TaskProps;
        if ('scheduleName' in props) {
            const getSchedules = await schedules.search(this.dbClient.db, { name: props.scheduleName, limit: 1 });
            if (getSchedules.isErr()) {
                return Err(getSchedules.error);
            }
            const schedule = getSchedules.value[0];
            if (!schedule) {
                return Err(new Error(`Schedule '${props.scheduleName}' not found`));
            }
            // Not scheduling a task if another task for the same schedule is already running
            const running = await tasks.search(this.dbClient.db, {
                scheduleId: schedule.id,
                states: ['CREATED', 'STARTED']
            });
            if (running.isErr()) {
                return Err(running.error);
            }
            if (running.value.length > 0) {
                return Err(new Error(`Task for schedule '${props.scheduleName}' is already running: ${running.value[0]?.id}`));
            }
            taskProps = {
                name: `${schedule.name}:${uuidv7()}`,
                payload: schedule.payload,
                groupKey: schedule.groupKey,
                retryMax: schedule.retryMax,
                retryCount: 0,
                createdToStartedTimeoutSecs: schedule.createdToStartedTimeoutSecs,
                startedToCompletedTimeoutSecs: schedule.startedToCompletedTimeoutSecs,
                heartbeatTimeoutSecs: schedule.heartbeatTimeoutSecs,
                startsAfter: new Date(),
                scheduleId: schedule.id
            };
        } else {
            taskProps = {
                ...props,
                startsAfter: new Date(),
                scheduleId: null
            };
        }
        const created = await tasks.create(this.dbClient.db, taskProps);
        if (created.isOk()) {
            const task = created.value;
            this.onCallbacks[task.state](task);
        }
        return created;
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
     *    heartbeatTimeoutSecs: 1
     * };
     * const schedule = await scheduler.recurring(schedulingProps);
     */

    public async recurring(props: ScheduleProps): Promise<Result<Schedule>> {
        return schedules.create(this.dbClient.db, props);
    }

    /**
     * Dequeue tasks
     * @param groupKey - Group key
     * @param limit - Limit
     * @returns Task[]
     * @example
     * const dequeued = await scheduler.dequeue({ groupKey: 'test', limit: 1 });
     */
    public async dequeue({ groupKey, limit }: { groupKey: string; limit: number }): Promise<Result<Task[]>> {
        const dequeued = await tasks.dequeue(this.dbClient.db, { groupKey, limit });
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
        return tasks.heartbeat(this.dbClient.db, taskId);
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
        const succeeded = await tasks.transitionState(this.dbClient.db, { taskId, newState: 'SUCCEEDED', output });
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
        const failed = await tasks.transitionState(this.dbClient.db, { taskId, newState: 'FAILED', output: error });
        if (failed.isOk()) {
            const task = failed.value;
            this.onCallbacks[task.state](task);
            // Create a new task if the task is retryable
            if (task.retryMax > task.retryCount) {
                const taskProps: ImmediateProps = {
                    name: task.name,
                    payload: task.payload,
                    groupKey: task.groupKey,
                    retryMax: task.retryMax,
                    retryCount: task.retryCount + 1,
                    createdToStartedTimeoutSecs: task.createdToStartedTimeoutSecs,
                    startedToCompletedTimeoutSecs: task.startedToCompletedTimeoutSecs,
                    heartbeatTimeoutSecs: task.heartbeatTimeoutSecs
                };
                const res = await this.immediate(taskProps);
                if (res.isErr()) {
                    logger.error(`Error retrying task '${taskId}': ${stringifyError(res.error)}`);
                }
            }
        }
        return failed;
    }

    /**
     * Cancel a task
     * @param cancelBy - Cancel by task ID or schedule ID
     * @param reason - Reason for cancellation
     * @returns Task
     * @example
     * const cancelled = await scheduler.cancel({ taskId: '00000000-0000-0000-0000-000000000000' });
     */
    public async cancel(cancelBy: { taskId: string; reason: JsonValue } | { scheduleName: string; reason: JsonValue }): Promise<Result<Task>> {
        if ('scheduleName' in cancelBy) {
            throw new Error(`Cancelling tasks for schedule '${cancelBy.scheduleName}' not implemented`);
        }
        const cancelled = await tasks.transitionState(this.dbClient.db, {
            taskId: cancelBy.taskId,
            newState: 'CANCELLED',
            output: { reason: cancelBy.reason }
        });
        if (cancelled.isOk()) {
            const task = cancelled.value;
            this.onCallbacks[task.state](task);
        }
        return cancelled;
    }
}
