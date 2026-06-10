import { getLogger, stringifyError } from '@nangohq/utils';

import { FunctionError } from './functions/helpers.js';
import { SandboxUnavailableError } from './providers/errors.js';
import { createSandboxProvider } from './providers/factory.js';

import type { CleanupSandboxParams, CreateSandboxParams, Sandbox, SandboxProvider } from './providers/types.js';

const logger = getLogger('FunctionSandbox');

export const executionEnvironmentUnavailableMessage = 'The function execution environment is temporarily unavailable. Please try again shortly.';

export class SandboxService {
    constructor(private readonly provider: SandboxProvider = createSandboxProvider()) {}

    get providerName(): SandboxProvider['name'] {
        return this.provider.name;
    }

    async create(params: CreateSandboxParams): Promise<Sandbox> {
        try {
            return await this.provider.create(params);
        } catch (err) {
            const unavailableError = toExecutionEnvironmentUnavailableError(err);
            if (unavailableError) {
                logger.warning('Function execution environment unavailable', { err });
                throw unavailableError;
            }

            throw err;
        }
    }

    async cleanup(params: { sandboxId: string | null | undefined; apiKey?: string | undefined }): Promise<void> {
        if (!params.sandboxId || params.sandboxId === 'local') {
            return;
        }

        const cleanupParams: CleanupSandboxParams = {
            sandboxId: params.sandboxId,
            ...(params.apiKey !== undefined ? { apiKey: params.apiKey } : {})
        };

        try {
            await this.provider.cleanup(cleanupParams);
        } catch (err) {
            logger.warning('Failed to clean up function sandbox', {
                sandboxId: params.sandboxId,
                provider: this.provider.name,
                err: stringifyError(err)
            });
        }
    }
}

export const sandboxService = new SandboxService();

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
    if (error instanceof SandboxUnavailableError) {
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
