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
    args: JsonValue;
}

interface ClientError extends Error {
    name: string;
    payload: JsonValue;
}

export type TExecuteProps = SetOptional<SchedulingProps, 'retry' | 'timeoutSettingsInSecs'>;
export type TExecuteReturn = Result<JsonValue, ClientError>;

export class OrchestratorClient {
    private fetchTimeoutMs: number;
    private baseUrl: string;

    constructor({ baseUrl, fetchTimeoutMs = 120_000 }: { baseUrl: string; fetchTimeoutMs?: number }) {
        this.baseUrl = baseUrl;
        this.fetchTimeoutMs = fetchTimeoutMs;
    }

    private routeFetch<E extends Endpoint<any>>(route: Route<E>) {
        return routeFetch(this.baseUrl, route);
    }

    public async schedule(props: SchedulingProps): Promise<Result<{ taskId: string }, ClientError>> {
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

    async execute(props: TExecuteProps): Promise<TExecuteReturn> {
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
        const start = Date.now();
        const timeoutInMs = this.fetchTimeoutMs;
        while (Date.now() - start < timeoutInMs) {
            const res = await this.routeFetch(outputRoute)({ params: { taskId } });
            if ('error' in res) {
                return Err({
                    name: res.error.code,
                    message: res.error.message || `Error fetching task '${taskId}' output`,
                    payload: {}
                });
            } else {
                switch (res.state) {
                    case 'SUCCEEDED':
                        return Ok(res.output);
                    case 'FAILED':
                        return Err({
                            name: 'task_failed_error',
                            message: `Task ${taskId} failed`,
                            payload: res.output
                        });
                    case 'EXPIRED':
                        return Err({
                            name: 'task_expired_error',
                            message: `Task ${taskId} expired`,
                            payload: res.output
                        });
                    case 'CANCELLED':
                        return Err({
                            name: 'task_cancelled_error',
                            message: `Task ${taskId} cancelled`,
                            payload: res.output
                        });
                }
            }
        }
        return Err({
            name: 'task_execute_timeout',
            message: `Task execution timeout: ${JSON.stringify(props)}`,
            payload: {}
        });
    }
}
