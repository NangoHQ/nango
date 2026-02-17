import { Err, Ok } from '@nangohq/utils';

import { httpFetch } from './http.js';
import { jobsServiceUrl } from '../env.js';

import type { PostHeartbeat, PostIdle, PostRegister, PutTask } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const defaultRetryOptions = {
    startingDelay: 1000,
    timeMultiple: 3,
    numOfAttempts: 3
};

class JobsClient {
    private baseUrl: string;

    constructor({ baseUrl }: { baseUrl: string }) {
        this.baseUrl = baseUrl;
    }

    async postHeartbeat({ taskId }: PostHeartbeat['Params']): Promise<Result<PostHeartbeat['Success']>> {
        const resp = await httpFetch(`${this.baseUrl}/tasks/${taskId}/heartbeat`, {
            method: 'POST'
        });
        if (!resp.ok) {
            return Err(`heartbeat_failed`);
        }
        return Ok(undefined as PostHeartbeat['Success']);
    }

    async putTask({
        taskId,
        nangoProps,
        error,
        output,
        telemetryBag,
        functionRuntime
    }: PutTask['Body'] & PutTask['Params']): Promise<Result<PutTask['Success']>> {
        const resp = await httpFetch(
            `${this.baseUrl}/tasks/${taskId}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nangoProps: nangoProps,
                    ...(error ? { error, telemetryBag } : { output, telemetryBag }),
                    functionRuntime
                })
            },
            defaultRetryOptions
        );
        if (!resp.ok) {
            // If the response is request content too large
            // we send a separate request to update the task with the error
            if (resp.status === 413) {
                return this.putTask({
                    taskId,
                    nangoProps,
                    error: {
                        type: 'script_output_too_large',
                        status: 413,
                        payload: {
                            message: 'Output is too large'
                        }
                    },
                    telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 1 },
                    functionRuntime
                });
            }
            return Err(`put_task_failed`);
        }
        return Ok(undefined as PutTask['Success']);
    }

    async postRegister({ nodeId, url }: PostRegister['Params'] & PostRegister['Body']): Promise<Result<PostRegister['Success']>> {
        const resp = await httpFetch(
            `${this.baseUrl}/runners/${nodeId}/register`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            },
            defaultRetryOptions
        );
        if (!resp.ok) {
            return Err(`register_failed`);
        }
        return Ok((await resp.json()) as PostRegister['Success']);
    }

    async postIdle({ nodeId }: PostIdle['Params']): Promise<Result<PostIdle['Success']>> {
        const resp = await httpFetch(
            `${this.baseUrl}/runners/${nodeId}/idle`,
            {
                method: 'POST'
            },
            defaultRetryOptions
        );
        if (!resp.ok) {
            return Err(`idle_failed`);
        }
        return Ok((await resp.json()) as PostIdle['Success']);
    }
}

export const jobsClient = new JobsClient({ baseUrl: jobsServiceUrl });
