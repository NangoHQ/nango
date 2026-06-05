import { randomUUID } from 'node:crypto';

import { RateLimitError, Sandbox } from 'e2b';

import { getLogger, stringifyError } from '@nangohq/utils';

import { RemoteFunctionError } from './helpers.js';
import { remoteFunctionCompilerTemplate } from './runtime.js';

import type { SandboxListOpts } from 'e2b';

const logger = getLogger('RemoteFunctionSandbox');

export const executionEnvironmentUnavailableMessage = 'The function execution environment is temporarily unavailable. Please try again shortly.';

export type RemoteFunctionSandbox = Awaited<ReturnType<typeof Sandbox.create>>;

export type RemoteFunctionSandboxPurpose = 'nango-compiler' | 'nango-deploy' | 'nango-function-dryrun';

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

export async function createRemoteFunctionSandbox({
    apiKey,
    purpose,
    timeoutMs,
    metadata = {}
}: {
    apiKey: string;
    purpose: RemoteFunctionSandboxPurpose;
    timeoutMs: number;
    metadata?: Record<string, string> | undefined;
}): Promise<RemoteFunctionSandbox> {
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

export function toExecutionEnvironmentUnavailableError(error: unknown): RemoteFunctionError | null {
    if (!isExecutionEnvironmentUnavailableError(error)) {
        return null;
    }

    return new RemoteFunctionError({
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
