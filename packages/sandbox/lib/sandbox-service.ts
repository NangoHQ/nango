import { getLogger, stringifyError } from '@nangohq/utils';

import { FunctionError } from './functions/helpers.js';
import { SandboxUnavailableError } from './providers/errors.js';
import { createSandboxProvider } from './providers/factory.js';

import type { CreateSandboxParams, Sandbox, SandboxProvider } from './providers/types.js';

const logger = getLogger('SandboxService');

export const executionEnvironmentUnavailableMessage = 'The function execution environment is temporarily unavailable. Please try again shortly.';

export class SandboxService {
    constructor(private readonly provider: SandboxProvider = createSandboxProvider()) {}

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

    async cleanup(params: { sandboxId: string | null | undefined }): Promise<void> {
        if (!params.sandboxId || params.sandboxId === 'local') {
            return;
        }

        try {
            await this.provider.cleanup(params.sandboxId);
        } catch (err) {
            logger.warning('Failed to clean up sandbox', {
                sandboxId: params.sandboxId,
                provider: this.provider.name,
                err: stringifyError(err)
            });
        }
    }
}

export const sandboxService = new SandboxService();

export function toExecutionEnvironmentUnavailableError(error: unknown): FunctionError | null {
    if (!(error instanceof SandboxUnavailableError)) {
        return null;
    }

    return new FunctionError({
        code: 'execution_environment_unavailable',
        message: executionEnvironmentUnavailableMessage,
        status: 503
    });
}
