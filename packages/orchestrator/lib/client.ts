import type { JsonValue, SetOptional } from 'type-fest';
import { route as scheduleRoute } from './routes/v1/schedule.js';
import { route as outputRoute } from './routes/v1/task/taskId/output.js';
import type { Result, Route } from '@nangohq/utils';
import { Ok, Err, routeFetch } from '@nangohq/utils';
import type { Endpoint } from '@nangohq/types';

interface SchedulingProps {
    name: string;
    groupKey: string;
    retry: {
        count: number;
        max: number;
    };
    timeoutSettingsInSecs: {
        createdToStarted: number;
        startedToCompleted: number;
        heartbeat: number;
    };
    args: JsonValue & { type: 'action' | 'webhook' | 'sync' };
}

interface TExecuteActionArgs {
    args: {
        name: string;
        connection: {
            id: number;
            provider_config_key: string;
            environment_id: number;
        };
        activityLogId: number;
        input: JsonValue;
    };
}
interface TExecuteWebhookArgs {
    args: {
        name: string;
        parentSyncName: string;
        connection: {
            id: number;
            provider_config_key: string;
            environment_id: number;
        };
        activityLogId: number | null;
        input: JsonValue;
    };
}

interface ClientError extends Error {
    name: string;
    payload: JsonValue;
}

export type TExecuteProps = SetOptional<SchedulingProps, 'retry' | 'timeoutSettingsInSecs'>;
export type TExecuteReturn = Result<JsonValue, ClientError>;
export type TExecuteActionProps = Omit<TExecuteProps, 'args'> & TExecuteActionArgs;
export type TExecuteWebhookProps = Omit<TExecuteProps, 'args'> & TExecuteWebhookArgs;

export class OrchestratorClient {
    private baseUrl: string;

    constructor({ baseUrl }: { baseUrl: string }) {
        this.baseUrl = baseUrl;
    }

    private routeFetch<E extends Endpoint<any>>(route: Route<E>) {
        return routeFetch(this.baseUrl, route);
    }

    private async schedule(props: SchedulingProps): Promise<Result<{ taskId: string }, ClientError>> {
        const res = await this.routeFetch(scheduleRoute)({
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
                payload: {} // TODO
            });
        } else {
            return Ok(res);
        }
    }

    private async execute(props: TExecuteProps): Promise<TExecuteReturn> {
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
        const getOutput = await this.routeFetch(outputRoute)({ params: { taskId }, query: { waitForCompletion: true } });
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

    public async executeAction(props: TExecuteActionProps): Promise<TExecuteReturn> {
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

    public async executeWebhook(props: TExecuteWebhookProps): Promise<TExecuteReturn> {
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
}
