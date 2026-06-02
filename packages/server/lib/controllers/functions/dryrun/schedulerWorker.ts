import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getRemoteFunctionNangoHost, invokeDryrun, parseDryrunSuccessOutput, remoteFunctionDryrunSandboxTimeoutMs } from '@nangohq/sandbox';
import { SchedulerWorker } from '@nangohq/scheduler';

import { remoteFunctionDryrunBodySchema } from '../validation.js';
import { createDryrunSandboxApiKey, defaultFunctionName, toFunctionDryrunError } from './helpers.js';

import type { ImmediateProps, Scheduler, SchedulerWorkerErrorContext, Task } from '@nangohq/scheduler';
import type { FunctionDryrunBody } from '@nangohq/types';
import type { JsonObject, JsonValue } from 'type-fest';

export const dryrunSchedulerGroupKeyPrefix = 'dryrun';
export const dryrunSchedulerGroupKeyPattern = `${dryrunSchedulerGroupKeyPrefix}:*`;
export const dryrunSchedulerHeartbeatIntervalMs = 10_000;
export const dryrunSchedulerHeartbeatTimeoutSecs = 60;

const dryrunSchedulerTimeoutSecs = Math.ceil(remoteFunctionDryrunSandboxTimeoutMs / 1000);

const dryrunSchedulerTaskPayloadSchema = z
    .object({
        environment_id: z.number().int().positive(),
        environment_name: z.string().min(1),
        parent_customer_key_id: z.number().int().positive(),
        request: remoteFunctionDryrunBodySchema
    })
    .strict();

export type DryrunSchedulerTaskPayload = z.infer<typeof dryrunSchedulerTaskPayloadSchema>;

export interface CreateDryrunSchedulerWorkerOptions {
    scheduler: Scheduler;
    groupKeyPattern?: string;
    limit?: number;
    pollIntervalMs?: number;
    heartbeatIntervalMs?: number;
    onError?: (err: Error, context: SchedulerWorkerErrorContext) => void;
}

export interface DryrunSchedulerTaskPropsInput {
    environment: {
        id: number;
        name: string;
    };
    parentCustomerKeyId: number;
    body: FunctionDryrunBody;
    groupMaxConcurrency?: number;
}

export function createDryrunSchedulerWorker({
    scheduler,
    groupKeyPattern = dryrunSchedulerGroupKeyPattern,
    limit = 5,
    pollIntervalMs,
    heartbeatIntervalMs = dryrunSchedulerHeartbeatIntervalMs,
    onError
}: CreateDryrunSchedulerWorkerOptions): SchedulerWorker {
    return new SchedulerWorker({
        scheduler,
        ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
        ...(onError ? { onError } : {}),
        handlers: [
            {
                groupKeyPattern,
                limit,
                heartbeatIntervalMs,
                toFailureOutput: toDryrunFailureOutput,
                handle: runDryrunSchedulerTask
            }
        ]
    });
}

export function buildDryrunSchedulerTaskProps({
    environment,
    parentCustomerKeyId,
    body,
    groupMaxConcurrency = 0
}: DryrunSchedulerTaskPropsInput): ImmediateProps {
    return {
        name: `${dryrunSchedulerGroupKey(environment.id)}:${randomUUID()}`,
        payload: buildDryrunSchedulerTaskPayload({ environment, parentCustomerKeyId, body }),
        groupKey: dryrunSchedulerGroupKey(environment.id),
        groupMaxConcurrency,
        retryMax: 0,
        retryCount: 0,
        createdToStartedTimeoutSecs: dryrunSchedulerTimeoutSecs,
        startedToCompletedTimeoutSecs: dryrunSchedulerTimeoutSecs,
        heartbeatTimeoutSecs: dryrunSchedulerHeartbeatTimeoutSecs,
        ownerKey: null,
        retryKey: null
    };
}

export function dryrunSchedulerGroupKey(environmentId: number): string {
    return `${dryrunSchedulerGroupKeyPrefix}:${environmentId}`;
}

async function runDryrunSchedulerTask(task: Task): Promise<{ output: JsonValue }> {
    const payload = dryrunSchedulerTaskPayloadSchema.parse(task.payload);
    const startedAt = Date.now();
    const sandboxApiKey = await createDryrunSandboxApiKey(payload.parent_customer_key_id, payload.environment_id, task.id);
    if (sandboxApiKey.isErr()) {
        throw sandboxApiKey.error;
    }

    const request = payload.request;
    const result = await invokeDryrun({
        integration_id: request.integration_id,
        function_name: request.function_name,
        function_type: request.function_type,
        code: request.code,
        connection_id: request.connection_id,
        environment_name: payload.environment_name,
        nango_secret_key: sandboxApiKey.value,
        nango_host: getRemoteFunctionNangoHost(),
        ...(request.input !== undefined ? { input: request.input } : {}),
        ...(request.metadata ? { metadata: request.metadata } : {}),
        ...(request.checkpoint ? { checkpoint: request.checkpoint } : {}),
        ...(request.last_sync_date ? { last_sync_date: request.last_sync_date } : {})
    });

    const dryrunOutput = parseDryrunSuccessOutput(result.output);

    return {
        output: toJsonObject({
            status: 'success',
            output: dryrunOutput.output,
            duration_ms: Date.now() - startedAt,
            has_result: dryrunOutput.hasResult,
            ...(dryrunOutput.hasResult ? { result: toJsonValue(dryrunOutput.result) } : {})
        })
    };
}

function buildDryrunSchedulerTaskPayload({
    environment,
    parentCustomerKeyId,
    body
}: Pick<DryrunSchedulerTaskPropsInput, 'environment' | 'parentCustomerKeyId' | 'body'>): JsonObject {
    return toJsonObject({
        environment_id: environment.id,
        environment_name: environment.name,
        parent_customer_key_id: parentCustomerKeyId,
        request: {
            integration_id: body.integration_id,
            function_name: defaultFunctionName,
            function_type: body.function_type,
            code: body.code,
            connection_id: body.connection_id,
            ...(body.input !== undefined ? { input: toJsonValue(body.input) } : {}),
            ...(body.metadata ? { metadata: toJsonValue(body.metadata) } : {}),
            ...(body.checkpoint ? { checkpoint: toJsonValue(body.checkpoint) } : {}),
            ...(body.last_sync_date ? { last_sync_date: body.last_sync_date } : {})
        }
    });
}

function toDryrunFailureOutput(err: unknown): JsonObject {
    return toJsonObject({
        status: 'failed',
        error: toJsonValue(toFunctionDryrunError(err))
    });
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
    return toJsonValue(value) as JsonObject;
}

function toJsonValue(value: unknown): JsonValue {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
}
