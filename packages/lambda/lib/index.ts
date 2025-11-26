import { MapLocks, exec, heartbeatIntervalMs, jobsClient } from '@nangohq/runner';
import { getLogger } from '@nangohq/utils';

import type { requestSchema } from './schemas.js';
import type { NangoProps } from '@nangohq/types';
import type { Context } from 'aws-lambda';
import type * as zod from 'zod';

const logger = getLogger('lambda-function-runner');

export const handler = async (event: zod.infer<typeof requestSchema>, context: Context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    let lastSuccessHeartbeatAt: number | null = null;
    const startTime = Date.now();
    const abortController = new AbortController();
    const heartbeatTimeoutMs = event.nangoProps.heartbeatTimeoutSecs ? event.nangoProps.heartbeatTimeoutSecs * 1000 : heartbeatIntervalMs * 3;

    const heartbeat = setInterval(async () => {
        if (lastSuccessHeartbeatAt && lastSuccessHeartbeatAt + heartbeatTimeoutMs < Date.now()) {
            // Jobs and orchestrator will kill the task if the heartbeat is not successful for too long
            // This is to prevent the task from hanging indefinitely if we have trouble reaching orch or the opposite
            logger.error('Heartbeat failed for too long, self killing task', { taskId: event.taskId });
            abortController.abort();
            clearInterval(heartbeat);
            return;
        }

        const res = await jobsClient.postHeartbeat({ taskId: event.taskId });
        if (res.isOk()) {
            lastSuccessHeartbeatAt = Date.now();
        }
    }, heartbeatIntervalMs);
    try {
        const payload = {
            nangoProps: event.nangoProps as unknown as NangoProps,
            code: event.code,
            codeParams: event.codeParams,
            locks: new MapLocks(), //new KVLocks(await getLocking()),
            abortController: abortController
        };
        logger.info('payload', JSON.stringify(payload));
        const execRes = await exec(payload);
        const telemetryBag = execRes.isErr() ? execRes.error.telemetryBag : execRes.value.telemetryBag;
        telemetryBag.durationMs = Date.now() - startTime;
        await jobsClient.putTask({
            taskId: event.taskId,
            nangoProps: event.nangoProps as unknown as NangoProps,
            ...(execRes.isErr() ? { error: execRes.error.toJSON(), telemetryBag } : { output: execRes.value.output as any, telemetryBag })
        });
    } catch (err: any) {
        logger.error('error', JSON.stringify(err));
        await jobsClient.putTask({
            taskId: event.taskId,
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
        logger.info(`Task ${event.taskId} completed`);
    }
};
