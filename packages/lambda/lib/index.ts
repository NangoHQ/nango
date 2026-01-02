import { getLocking } from '@nangohq/kvstore';
import { KVLocks, exec, heartbeatIntervalMs, jobsClient } from '@nangohq/runner';
import { getLogger } from '@nangohq/utils';

import { requestSchema } from './schemas.js';

import type { NangoProps } from '@nangohq/types';
import type { Context } from 'aws-lambda';
import type * as zod from 'zod';

const logger = getLogger('lambda-function-runner');

function getNangoHost() {
    return process.env['NANGO_HOST'] || 'http://server.internal.nango';
}

export const handler = async (event: zod.infer<typeof requestSchema>, context: Context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    let lastSuccessHeartbeatAt: number | null = null;
    const startTime = Date.now();
    const request = requestSchema.parse(event);
    const abortController = new AbortController();
    const heartbeatTimeoutMs = request.nangoProps.heartbeatTimeoutSecs ? request.nangoProps.heartbeatTimeoutSecs * 1000 : heartbeatIntervalMs * 3;

    const heartbeat = setInterval(async () => {
        if (lastSuccessHeartbeatAt && lastSuccessHeartbeatAt + heartbeatTimeoutMs < Date.now()) {
            // Jobs and orchestrator will kill the task if the heartbeat is not successful for too long
            // This is to prevent the task from hanging indefinitely if we have trouble reaching orch or the opposite
            logger.error('Heartbeat failed for too long, self killing task', { taskId: request.taskId });
            abortController.abort();
            clearInterval(heartbeat);
            return;
        }

        const res = await jobsClient.postHeartbeat({ taskId: request.taskId });
        if (res.isOk()) {
            lastSuccessHeartbeatAt = Date.now();
        }
    }, heartbeatIntervalMs);
    try {
        const payload = {
            nangoProps: { ...(request.nangoProps as unknown as NangoProps), host: getNangoHost() },
            code: request.code,
            codeParams: request.codeParams,
            locks: new KVLocks(await getLocking()),
            abortController: abortController
        };
        const execRes = await exec(payload);
        const telemetryBag = execRes.isErr() ? execRes.error.telemetryBag : execRes.value.telemetryBag;
        telemetryBag.durationMs = Date.now() - startTime;
        await jobsClient.putTask({
            taskId: request.taskId,
            nangoProps: request.nangoProps as unknown as NangoProps,
            ...(execRes.isErr() ? { error: execRes.error.toJSON(), telemetryBag } : { output: execRes.value.output as any, telemetryBag })
        });
    } catch (err: any) {
        await jobsClient.putTask({
            taskId: request.taskId,
            error: {
                type: 'lambda_error',
                payload: {
                    message: err.message as string
                },
                status: 500
            },
            telemetryBag: {
                customLogs: 0,
                proxyCalls: 0,
                durationMs: Date.now() - startTime,
                memoryGb: Number(context.memoryLimitInMB) / 1024
            }
        });
    } finally {
        clearInterval(heartbeat);
        logger.info(`Task ${request.taskId} completed`);
    }
};
