import { postRoute as postScheduleRoute } from '../routes/v1/schedule.js';
import { getRoute as getDequeueRoute } from '../routes/v1/dequeue.js';
import { postRoute as postSearchRoute } from '../routes/v1/search.js';
import { getRoute as getOutputRoute } from '../routes/v1/tasks/taskId/output.js';
import { putRoute as putTaskRoute } from '../routes/v1/tasks/taskId.js';
import { postRoute as postHeartbeatRoute } from '../routes/v1/tasks/taskId/heartbeat.js';
import type { Result, Route } from '@nangohq/utils';
import { Ok, Err, routeFetch, stringifyError } from '@nangohq/utils';
import type { Endpoint } from '@nangohq/types';
import type { ClientError, SchedulingProps, ExecuteActionProps, ExecuteProps, ExecuteReturn, ExecuteWebhookProps, TaskAction, TaskWebhook } from './types.js';
import { validateTask } from './validate.js';
import type { JsonValue } from 'type-fest';

export class OrchestratorClient {
    private baseUrl: string;

    constructor({ baseUrl }: { baseUrl: string }) {
        this.baseUrl = baseUrl;
    }

    private routeFetch<E extends Endpoint<any>>(route: Route<E>) {
        return routeFetch(this.baseUrl, route);
    }

    public async schedule(props: SchedulingProps): Promise<Result<{ taskId: string }, ClientError>> {
        const res = await this.routeFetch(postScheduleRoute)({
            body: {
                scheduling: 'immediate',
                name: props.name,
                groupKey: props.groupKey,
                retry: props.retry,
                timeoutSettingsInSecs: props.timeoutSettingsInSecs,
                args: props.args
            }
        });
        if ('error' in res) {
            return Err({
                name: res.error.code,
                message: res.error.message || `Error scheduling tasks`,
                payload: JSON.stringify(props)
            });
        } else {
            return Ok(res);
        }
    }

    private async execute(props: ExecuteProps): Promise<ExecuteReturn> {
        const scheduleProps = {
            retry: { count: 0, max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
            ...props
        } as SchedulingProps;
        const res = await this.schedule(scheduleProps);
        if (res.isErr()) {
            return res;
        }
        const taskId = res.value.taskId;
        const getOutput = await this.routeFetch(getOutputRoute)({ params: { taskId }, query: { waitForCompletion: true } });
        if ('error' in getOutput) {
            return Err({
                name: getOutput.error.code,
                message: getOutput.error.message || `Error fetching task '${taskId}' output`,
                payload: {}
            });
        } else {
            switch (getOutput.state) {
                case 'CREATED':
                case 'STARTED':
                    return Err({
                        name: 'task_in_progress_error',
                        message: `Task ${taskId} is in progress`,
                        payload: getOutput.output
                    });
                case 'SUCCEEDED':
                    return Ok(getOutput.output);
                case 'FAILED':
                    return Err({
                        name: 'task_failed_error',
                        message: `Task ${taskId} failed`,
                        payload: getOutput.output
                    });
                case 'EXPIRED':
                    return Err({
                        name: 'task_expired_error',
                        message: `Task ${taskId} expired`,
                        payload: getOutput.output
                    });
                case 'CANCELLED':
                    return Err({
                        name: 'task_cancelled_error',
                        message: `Task ${taskId} cancelled`,
                        payload: getOutput.output
                    });
            }
        }
    }

    public async executeAction(props: ExecuteActionProps): Promise<ExecuteReturn> {
        const { args, ...rest } = props;
        const schedulingProps = {
            ...rest,
            args: {
                ...args,
                type: 'action' as const
            }
        };
        return this.execute(schedulingProps);
    }

    public async executeWebhook(props: ExecuteWebhookProps): Promise<ExecuteReturn> {
        const { args, ...rest } = props;
        const schedulingProps = {
            ...rest,
            args: {
                ...args,
                type: 'webhook' as const
            }
        };
        return this.execute(schedulingProps);
    }

    public async search({
        ids,
        groupKey,
        limit
    }: {
        ids?: string[];
        groupKey?: string;
        limit?: number;
    }): Promise<Result<(TaskWebhook | TaskAction)[], ClientError>> {
        const body = {
            ...(ids ? { ids } : {}),
            ...(groupKey ? { groupKey } : {}),
            ...(limit ? { limit } : {})
        };
        const res = await this.routeFetch(postSearchRoute)({ body });
        if ('error' in res) {
            return Err({
                name: res.error.code,
                message: res.error.message || `Error listing tasks`,
                payload: body
            });
        } else {
            const tasks = res.flatMap((task) => {
                const validated = validateTask(task);
                if (validated.isErr()) {
                    return [];
                }
                return [validated.value];
            });
            return Ok(tasks);
        }
    }

    public async dequeue({
        groupKey,
        limit,
        waitForCompletion = true
    }: {
        groupKey: string;
        limit: number;
        waitForCompletion?: boolean;
    }): Promise<Result<(TaskWebhook | TaskAction)[], ClientError>> {
        const res = await this.routeFetch(getDequeueRoute)({
            query: {
                groupKey,
                limit,
                waitForCompletion
            }
        });
        if ('error' in res) {
            return Err({
                name: res.error.code,
                message: res.error.message || `Error dequeueing tasks`,
                payload: { groupKey, limit }
            });
        } else {
            const dequeuedTasks = res.flatMap((task) => {
                const validated = validateTask(task);
                if (validated.isErr()) {
                    return [];
                }
                return [validated.value];
            });
            return Ok(dequeuedTasks);
        }
    }

    public async heartbeat({ taskId }: { taskId: string }): Promise<Result<void, ClientError>> {
        const res = await this.routeFetch(postHeartbeatRoute)({
            params: { taskId }
        });
        if ('error' in res) {
            return Err({
                name: res.error.code,
                message: res.error.message || `Error heartbeating task '${taskId}'`,
                payload: { taskId }
            });
        } else {
            return Ok(undefined);
        }
    }

    public async succeed({ taskId, output }: { taskId: string; output: JsonValue }): Promise<Result<TaskAction | TaskWebhook, ClientError>> {
        const res = await this.routeFetch(putTaskRoute)({
            params: { taskId },
            body: { output, state: 'SUCCEEDED' }
        });
        if ('error' in res) {
            return Err({
                name: res.error.code,
                message: res.error.message || `Error succeeding task '${taskId}'`,
                payload: { taskId, output }
            });
        } else {
            return validateTask(res).mapError((err) => ({
                name: 'succeed_failed',
                message: `Failed to mark task ${taskId} as succeeded: ${stringifyError(err)}`,
                payload: { taskId, output }
            }));
        }
    }

    public async failed({ taskId, error }: { taskId: string; error: Error }): Promise<Result<TaskAction | TaskWebhook, ClientError>> {
        const output = { name: error.name, message: error.message };
        const res = await this.routeFetch(putTaskRoute)({
            params: { taskId },
            body: { output, state: 'FAILED' }
        });
        if ('error' in res) {
            return Err({
                name: res.error.code,
                message: res.error.message || `Error failing task '${taskId}'`,
                payload: { taskId, error: output }
            });
        } else {
            return validateTask(res).mapError((err) => ({
                name: 'failed_failed',
                message: `Failed to mark task ${taskId} as failed: ${stringifyError(err)}`,
                payload: { taskId, error: output }
            }));
        }
    }

    public async cancel({ taskId, reason }: { taskId: string; reason: string }): Promise<Result<TaskAction | TaskWebhook, ClientError>> {
        const res = await this.routeFetch(putTaskRoute)({
            params: { taskId },
            body: { output: reason, state: 'CANCELLED' }
        });
        if ('error' in res) {
            return Err({
                name: res.error.code,
                message: res.error.message || `Error cancelling task '${taskId}'`,
                payload: { taskId, error: reason }
            });
        } else {
            return validateTask(res).mapError((err) => ({
                name: 'cacel_failed',
                message: `Failed to mark task ${taskId} as cancelled: ${stringifyError(err)}`,
                payload: { taskId, error: reason }
            }));
        }
    }
}
