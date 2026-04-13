import { gunzipSync } from 'node:zlib';

import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getKVStore, getLocking } from '@nangohq/kvstore';
import { KVLocks, abortCheckIntervalMs, exec, heartbeatIntervalMs, jobsClient } from '@nangohq/runner';
import { loadProviders } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { lambdaInvocationSchema } from './schemas.js';

import type { FunctionExecutionRequest, LambdaInvocation, ReadinessCheckRequest } from './schemas.js';
import type { Lock, Locking } from '@nangohq/kvstore';
import type { NangoProps } from '@nangohq/types';
import type { Context } from 'aws-lambda';

const logger = getLogger('lambda-function-runner');
const s3 = new S3Client();

interface GatePass {
    lock?: Lock;
    allowed: boolean;
}

class Gate {
    constructor(private readonly locking: Locking) {}

    getKey(nangoProps: NangoProps): string {
        return `function:${nangoProps.scriptType}:${nangoProps.syncId}`;
    }

    async enter(nangoProps: NangoProps, opts: { ttlMs: number }): Promise<GatePass> {
        try {
            if (nangoProps.scriptType !== 'sync') return { allowed: true };
            const key = this.getKey(nangoProps);
            const lock = await this.locking.tryAcquire(key, opts.ttlMs, 1000);
            return {
                allowed: true,
                lock
            };
        } catch {
            return { allowed: false };
        }
    }

    async exit(lock: Lock) {
        await this.locking.release(lock);
    }
}

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
    const kvStore = await getKVStore('customer');
    const locking = await getLocking('customer');
    const gate = new Gate(locking);
    const pass = await gate.enter(nangoProps, { ttlMs: context.getRemainingTimeInMillis() });
    if (!pass.allowed) {
        logger.error('Conflicting sync detected', { syncId: nangoProps.syncId });
        throw new Error('Conflicting sync detected');
    }
    const locks = new KVLocks(kvStore);

    let lastSuccessHeartbeatAt: number | null = null;
    const startTime = Date.now();

    const abortController = new AbortController();
    const heartbeatTimeoutMs = request.nangoProps.heartbeatTimeoutSecs ? request.nangoProps.heartbeatTimeoutSecs * 1000 : heartbeatIntervalMs * 3;

    const abort = setInterval(async () => {
        const shouldAbort = await kvStore.exists(`function:${request.taskId}:abort`);
        if (shouldAbort) {
            logger.info('Aborting task', { taskId: request.taskId });
            abortController.abort();
            clearInterval(abort);
            return;
        }
    }, abortCheckIntervalMs);

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
        await jobsClient.putTask({
            taskId: request.taskId,
            nangoProps: request.nangoProps as unknown as NangoProps,
            functionRuntime: 'lambda',
            telemetryBag,
            checkpoints,
            ...(execRes.isErr() ? { error: execRes.error.toJSON() } : { output: execRes.value.output as any })
        });
    } catch (err: any) {
        await jobsClient.putTask({
            taskId: request.taskId,
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
    } finally {
        clearInterval(heartbeat);
        if (pass.lock) {
            await gate.exit(pass.lock);
        }
        await deleteCodeParams(request);
        logger.info(`Task ${request.taskId} completed`);
    }
};
