import { isMainThread } from 'node:worker_threads';
import type { Json, SchedulingProps, Task, TaskState } from './types';
import * as tasks from './models/tasks.js';
import type { Result } from '@nangohq/utils';
import { stringifyError, getLogger } from '@nangohq/utils';
import { MonitorWorker } from './monitor.worker.js';

const logger = getLogger('Scheduler');

export class Scheduler {
    // TODO: scheduling recurring tasks

    private monitor: MonitorWorker | null = null;
    private onCallbacks: Record<TaskState, (task: Task) => void>;

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
    constructor({ on }: { on: Record<TaskState, (task: Task) => void> }) {
        this.onCallbacks = on;
        if (isMainThread) {
            this.monitor = new MonitorWorker();
            this.monitor.on(async (message) => {
                const { ids } = message;
                for (const taskId of ids) {
                    const fetched = await tasks.get(taskId);
                    if (fetched.isOk()) {
                        const task = fetched.value;
                        this.onCallbacks[task.state](task);
                    }
                }
            });
            this.monitor.start();
        } else {
            throw new Error('Scheduler must be instantiated in the main thread');
        }
    }

    stop(): void {
        this.monitor?.stop();
    }

    /**
     * Get a task
     * @param taskId - Task ID
     * @returns Task
     * @example
     * const task = await scheduler.get({ taskId: '00000000-0000-0000-0000-000000000000' });
     */
    public async get({ taskId }: { taskId: string }): Promise<Result<Task>> {
        return tasks.get(taskId);
    }

    /**
     * List tasks
     * @param params
     * @param params.groupKey - Group key
     * @param params.state - Task state
     * @returns Task[]
     * @example
     * const tasks = await scheduler.list({ groupKey: 'test', state: 'CREATED' });
     */
    public async list(params?: { groupKey?: string; state?: TaskState }): Promise<Result<Task[]>> {
        return tasks.list(params);
    }

    /**
     * Schedule a task
     * @param props - Scheduling properties
     * @param props.scheduling - 'immediate'
     * @params props.taskProps - Task properties
     * @returns Task
     * @example
     * const schedulingProps = {
     *     scheduling: 'immediate',
     *     taskProps: {
     *         name: 'myName',
     *         payload: {foo: 'bar'},
     *         groupKey: 'myGroupKey',
     *         retryMax: 1,
     *         retryCount: 0,
     *         createdToStartedTimeoutSecs: 1,
     *         startedToCompletedTimeoutSecs: 1,
     *         heartbeatTimeoutSecs: 1
     *     }
     * };
     * const scheduled = await scheduler.schedule(schedulingProps);
     */
    public async schedule(props: SchedulingProps): Promise<Result<Task>> {
        switch (props.scheduling) {
            case 'immediate': {
                const taskProps = {
                    ...props.taskProps,
                    startsAfter: new Date()
                };
                const created = await tasks.create(taskProps);
                if (created.isOk()) {
                    const task = created.value;
                    this.onCallbacks[task.state](task);
                }
                return created;
            }
        }
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
        const dequeued = await tasks.dequeue({ groupKey, limit });
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
        return tasks.heartbeat(taskId);
    }

    /**
     * Mark task as Succeeded
     * @param taskId - Task ID
     * @param output - Output
     * @returns Task
     * @example
     * const succeed = await scheduler.succeed({ taskId: '00000000-0000-0000-0000-000000000000', output: {foo: 'bar'} });
     */
    public async succeed({ taskId, output }: { taskId: string; output: Json }): Promise<Result<Task>> {
        const succeeded = await tasks.transitionState({ taskId, newState: 'SUCCEEDED', output });
        if (succeeded.isOk()) {
            const task = succeeded.value;
            this.onCallbacks[task.state](task);
        }
        return succeeded;
    }

    /**
     * Fail a task
     * @param taskId - Task ID
     * @returns Task
     * @example
     * const failed = await scheduler.fail({ taskId: '00000000-0000-0000-0000-000000000000' });
     */
    public async fail({ taskId }: { taskId: string }): Promise<Result<Task>> {
        const failed = await tasks.transitionState({ taskId, newState: 'FAILED' });
        if (failed.isOk()) {
            const task = failed.value;
            this.onCallbacks[task.state](task);
            // Create a new task if the task is retryable
            if (task.retryMax > task.retryCount) {
                const schedulingProps: SchedulingProps = {
                    scheduling: 'immediate',
                    taskProps: {
                        name: task.name,
                        payload: task.payload,
                        groupKey: task.groupKey,
                        retryMax: task.retryMax,
                        retryCount: task.retryCount + 1,
                        createdToStartedTimeoutSecs: task.createdToStartedTimeoutSecs,
                        startedToCompletedTimeoutSecs: task.startedToCompletedTimeoutSecs,
                        heartbeatTimeoutSecs: task.heartbeatTimeoutSecs
                    }
                };
                const res = await this.schedule(schedulingProps);
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
     * @returns Task
     * @example
     * const cancelled = await scheduler.cancel({ taskId: '00000000-0000-0000-0000-000000000000' });
     */
    public async cancel(cancelBy: { taskId: string } | { scheduleId: string }): Promise<Result<Task>> {
        if ('scheduleId' in cancelBy) {
            throw new Error(`Cancelling tasks for schedule '${cancelBy.scheduleId}' not implemented`);
        }
        const cancelled = await tasks.transitionState({ taskId: cancelBy.taskId, newState: 'CANCELLED' });
        if (cancelled.isOk()) {
            const task = cancelled.value;
            this.onCallbacks[task.state](task);
        }
        return cancelled;
    }
}
