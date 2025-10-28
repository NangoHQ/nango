import { Err, Ok, retryWithBackoff } from '@nangohq/utils';

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
        try {
            const resp = await httpFetch(`${this.baseUrl}/tasks/${taskId}/heartbeat`, {
                method: 'POST'
            });
            if (!resp.ok) {
                throw new Error('heartbeat_failed');
            }
            return Ok(undefined as PostHeartbeat['Success']);
        } catch {
            return Err(`heartbeat_failed`);
        }
    }

    async putTask({ taskId, nangoProps, error, output, telemetryBag }: PutTask['Body'] & PutTask['Params']): Promise<Result<PutTask['Success']>> {
        try {
            const res = await retryWithBackoff(async () => {
                const resp = await httpFetch(`${this.baseUrl}/tasks/${taskId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        nangoProps: nangoProps,
                        ...(error ? { error, telemetryBag } : { output, telemetryBag })
                    })
                });
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
                            telemetryBag: { customLogs: 0, proxyCalls: 0, durationMs: 0, memoryGb: 1 }
                        });
                    }
                    throw new Error('put_task_failed');
                }
                return Ok(undefined as PutTask['Success']);
            }, defaultRetryOptions);
            return res as Result<PutTask['Success']>;
        } catch {
            return Err(`put_task_failed`);
        }
    }

    async postRegister({ nodeId, url }: PostRegister['Params'] & PostRegister['Body']): Promise<Result<PostRegister['Success']>> {
        try {
            const res = await retryWithBackoff(async () => {
                const resp = await httpFetch(`${this.baseUrl}/runners/${nodeId}/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url })
                });
                if (!resp.ok) {
                    throw new Error('register_failed');
                }
                return Ok((await resp.json()) as PostRegister['Success']);
            }, defaultRetryOptions);
            return res as Result<PostRegister['Success']>;
        } catch {
            return Err(`register_failed`);
        }
    }

    async postIdle({ nodeId }: PostIdle['Params']): Promise<Result<PostIdle['Success']>> {
        try {
            const res = await retryWithBackoff(async () => {
                const resp = await httpFetch(`${this.baseUrl}/runners/${nodeId}/idle`, {
                    method: 'POST'
                });
                if (!resp.ok) {
                    throw new Error(`idle_failed`);
                }
                return Ok((await resp.json()) as PostIdle['Success']);
            }, defaultRetryOptions);
            return res as Result<PostIdle['Success']>;
        } catch {
            return Err(`idle_failed`);
        }
    }
}

export const jobsClient = new JobsClient({ baseUrl: jobsServiceUrl });
