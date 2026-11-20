import { gunzipSync } from 'node:zlib';

import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { JobsClient } from '@nangohq/internal-clients/jobs';
import { PersistClient } from '@nangohq/internal-clients/persist';
import { envs, exec, HttpLocks, syncConflictTtlMs } from '@nangohq/runner/runner';
import { getJobsUrl, getPersistAPIUrl, loadProviders } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { lambdaInvocationSchema } from './schemas.js';

import type { FunctionExecutionRequest, LambdaInvocation, ReadinessCheckRequest } from './schemas.js';
import type { NangoProps } from '@nangohq/types';
import type { Context } from 'aws-lambda';

const logger = getLogger('lambda-function-runner');
const s3 = new S3Client();
const jobsClient = new JobsClient({ baseUrl: getJobsUrl(), nodeToken: envs.NANGO_INTERNAL_AUTH_RUNNER_NODE_TOKEN });

function getNangoHost() {
    return process.env['NANGO_HOST'] || 'http://server.internal.nango';
}

function isReadinessCheckRequest(request: LambdaInvocation): request is ReadinessCheckRequest {
    return 'type' in request && request.type === 'readiness_check';
}

async function getCode(request: FunctionExecutionRequest): Promise<string> {
    if ('code' in request && request.code) {
        return request.code;
    }
    if ('codeRef' in request && request.codeRef) {
        const response = await s3.send(
            new GetObjectCommand({
                Bucket: request.codeRef.bucket,
                Key: request.codeRef.key
            })
        );
        if (!response.Body) return '';
        const bytes = await response.Body.transformToByteArray();
        return gunzipSync(Buffer.from(bytes)).toString('utf8');
    }
    return '';
}

async function deleteCodeParams(request: FunctionExecutionRequest): Promise<void> {
    try {
        if ('codeParamsRef' in request && request.codeParamsRef) {
            await s3.send(
                new DeleteObjectCommand({
                    Bucket: request.codeParamsRef.bucket,
                    Key: request.codeParamsRef.key
                })
            );
        }
    } catch (err) {
        logger.error('Error deleting code params', { error: err });
        //ignore error - the payload will be deleted by the bucket lifecycle policy
    }
}

async function getCodeParams(request: FunctionExecutionRequest): Promise<object> {
    if ('codeParams' in request && request.codeParams) {
        return request.codeParams;
    }
    if ('codeParamsRef' in request && request.codeParamsRef) {
        const response = await s3.send(
            new GetObjectCommand({
                Bucket: request.codeParamsRef.bucket,
                Key: request.codeParamsRef.key
            })
        );
        if (!response.Body) return {};
        const bytes = await response.Body.transformToByteArray();
        const json = gunzipSync(Buffer.from(bytes)).toString('utf8');
        return JSON.parse(json || '{}');
    }
    return {};
}

export const handler = async (event: unknown, context: Context): Promise<{ ok: true } | void> => {
    context.callbackWaitsForEmptyEventLoop = false;
    const parsedRequest = lambdaInvocationSchema.parse(event);
    if (isReadinessCheckRequest(parsedRequest)) {
        logger.info('Readiness check invocation received');
        return { ok: true };
    }
    const request: FunctionExecutionRequest = parsedRequest;

    const nangoProps = { ...(request.nangoProps as unknown as NangoProps) };
    const persistClient = new PersistClient({ secretKey: nangoProps.secretKey, baseUrl: getPersistAPIUrl() });
    const locks = new HttpLocks({ persistClient, environmentId: nangoProps.environmentId });

    if (nangoProps.scriptType === 'sync' && nangoProps.syncId) {
        const conflictRes = await persistClient.putSyncConflict({
            environmentId: nangoProps.environmentId,
            scriptType: nangoProps.scriptType,
            syncId: nangoProps.syncId,
            ttlMs: syncConflictTtlMs
        });
        if (conflictRes.isErr()) {
            logger.error('Conflicting sync detected', { syncId: nangoProps.syncId });
            throw new Error('Conflicting sync detected');
        }
    }

    let lastSuccessHeartbeatAt: number | null = null;
    const startTime = Date.now();

    const abortController = new AbortController();
    const heartbeatTimeoutMs = request.nangoProps.heartbeatTimeoutSecs ? request.nangoProps.heartbeatTimeoutSecs * 1000 : envs.RUNNER_HEARTBEAT_INTERVAL_MS * 3;

    const abort = setInterval(async () => {
        try {
            const abortRes = await persistClient.getTaskAbort({ environmentId: nangoProps.environmentId, taskId: request.taskId });
            if (abortRes.isOk() && abortRes.value) {
                logger.info('Aborting task', { taskId: request.taskId });
                abortController.abort();
                clearInterval(abort);
            }
        } catch {
            // best-effort abort poll; retry on next interval
        }
    }, envs.RUNNER_ABORT_CHECK_INTERVAL_MS);

    const heartbeat = setInterval(async () => {
        if (lastSuccessHeartbeatAt && lastSuccessHeartbeatAt + heartbeatTimeoutMs < Date.now()) {
            logger.error('Heartbeat failed for too long, self killing task', { taskId: request.taskId });
            abortController.abort();
            clearInterval(heartbeat);
            return;
        }

        const res = await jobsClient.postHeartbeat({ taskId: request.taskId, internalAuthToken: request.internalAuthToken });
        if (res.isOk()) {
            lastSuccessHeartbeatAt = Date.now();
        }

        if (nangoProps.scriptType === 'sync' && nangoProps.syncId) {
            const refreshRes = await persistClient.putSyncConflict({
                environmentId: nangoProps.environmentId,
                scriptType: nangoProps.scriptType,
                syncId: nangoProps.syncId,
                refresh: true,
                ttlMs: syncConflictTtlMs
            });
            if (refreshRes.isErr()) {
                logger.error('Failed to refresh sync conflict lock', { error: refreshRes.error });
            }
        }
    }, envs.RUNNER_HEARTBEAT_INTERVAL_MS);
    try {
        const [code, codeParams] = await Promise.all([getCode(request), getCodeParams(request)]);
        if (code === '') {
            throw new Error('No code found');
        }
        try {
            await loadProviders();
        } catch (err) {
            logger.error('Error loading providers', { error: err });
        }
        const payload = {
            nangoProps: { ...nangoProps, host: getNangoHost() },
            code,
            codeParams,
            locks,
            abortController: abortController
        };
        const execRes = await exec(payload);
        const telemetryBag = execRes.isErr() ? execRes.error.telemetryBag : execRes.value.telemetryBag;
        const checkpoints = execRes.isErr() ? execRes.error.checkpoints : execRes.value.checkpoints;
        telemetryBag.durationMs = Date.now() - startTime;
        telemetryBag.memoryGb = Number(context.memoryLimitInMB) / 1024;
        const putRes = await jobsClient.putTask({
            taskId: request.taskId,
            nangoProps: request.nangoProps as unknown as NangoProps,
            functionRuntime: 'lambda',
            telemetryBag,
            checkpoints,
            internalAuthToken: request.internalAuthToken,
            ...(execRes.isErr() ? { error: execRes.error.toJSON() } : { output: execRes.value.output as any })
        });
        if (putRes.isErr()) {
            logger.error('Failed to report task result, task will be left to expire', { error: putRes.error, taskId: request.taskId });
        }
    } catch (err: any) {
        const putRes = await jobsClient.putTask({
            taskId: request.taskId,
            internalAuthToken: request.internalAuthToken,
            error: {
                type: 'function_internal_error',
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
            },
            functionRuntime: 'lambda'
        });
        if (putRes.isErr()) {
            logger.error('Failed to report task failure, task will be left to expire', { error: putRes.error, taskId: request.taskId });
        }
    } finally {
        clearInterval(heartbeat);
        clearInterval(abort);
        if (nangoProps.scriptType === 'sync' && nangoProps.syncId) {
            const releaseRes = await persistClient.deleteSyncConflict({
                environmentId: nangoProps.environmentId,
                scriptType: nangoProps.scriptType,
                syncId: nangoProps.syncId
            });
            if (releaseRes.isErr()) {
                logger.error('Failed to release sync conflict lock', { error: releaseRes.error });
            }
        }
        await deleteCodeParams(request);
        logger.info(`Task ${request.taskId} completed`);
    }
};
