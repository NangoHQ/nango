import { randomUUID } from 'node:crypto';

import { RateLimitError, Sandbox } from 'e2b';

import { getLogger, stringifyError } from '@nangohq/utils';

import { FunctionError } from './helpers.js';
import { remoteFunctionCompilerTemplate } from './runtime.js';
import { envs } from '../env.js';

import type { SandboxListOpts } from 'e2b';

const logger = getLogger('FunctionSandbox');

export const executionEnvironmentUnavailableMessage = 'The function execution environment is temporarily unavailable. Please try again shortly.';

export type FunctionSandbox = Awaited<ReturnType<typeof Sandbox.create>>;

export type FunctionSandboxPurpose = 'compile' | 'deploy' | 'dryrun';

export async function cleanupFunctionSandbox({
    sandboxId,
    apiKey = envs.E2B_API_KEY
}: {
    sandboxId: string | null | undefined;
    apiKey?: string | undefined;
}): Promise<void> {
    if (!sandboxId || sandboxId === 'local') {
        return;
    }

    if (!apiKey) {
        logger.warning('Skipping function sandbox cleanup because E2B_API_KEY is not set', { sandboxId });
        return;
    }

    try {
        await Sandbox.kill(sandboxId, { apiKey });
    } catch (err) {
        logger.warning('Failed to clean up function sandbox', { sandboxId, err });
    }
}

export async function getRunningSandboxCount({ apiKey, requestTimeoutMs }: { apiKey: string; requestTimeoutMs?: number | undefined }): Promise<number> {
    const listOptions = {
        apiKey,
        ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}),
        query: { state: ['running'] }
    } satisfies SandboxListOpts;

    const paginator = Sandbox.list(listOptions);

    let count = 0;
    while (paginator.hasNext) {
        count += (await paginator.nextItems()).length;
    }

    return count;
}

export async function createFunctionSandbox({
    apiKey,
    purpose,
    timeoutMs,
    metadata = {}
}: {
    apiKey: string;
    purpose: FunctionSandboxPurpose;
    timeoutMs: number;
    metadata?: Record<string, string> | undefined;
}): Promise<FunctionSandbox> {
    try {
        return await Sandbox.create(remoteFunctionCompilerTemplate, {
            timeoutMs,
            allowInternetAccess: true,
            metadata: { ...metadata, purpose, requestId: randomUUID() },
            network: { allowPublicTraffic: true },
            apiKey
        });
    } catch (err) {
        const unavailableError = toExecutionEnvironmentUnavailableError(err);
        if (unavailableError) {
            logger.warning('Function execution environment unavailable', { err });
            throw unavailableError;
        }

        throw err;
    }
}

export function toExecutionEnvironmentUnavailableError(error: unknown): FunctionError | null {
    if (!isExecutionEnvironmentUnavailableError(error)) {
        return null;
    }

    return new FunctionError({
        code: 'execution_environment_unavailable',
        message: executionEnvironmentUnavailableMessage,
        status: 503
    });
}

function isExecutionEnvironmentUnavailableError(error: unknown): boolean {
    if (error instanceof RateLimitError) {
        return true;
    }

    if (hasHttpStatus(error, 429)) {
        return true;
    }

    const message = stringifyError(error).toLowerCase();

    return (
        message.includes('rate limit') ||
        message.includes('too many sandboxes') ||
        message.includes('concurrent sandbox') ||
        message.includes('concurrency limit') ||
        message.includes('sandbox limit') ||
        message.includes('quota')
    );
}

function hasHttpStatus(error: unknown, status: number): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const err = error as Record<string, unknown>;
    return err['status'] === status || err['statusCode'] === status || err['code'] === status;
}
