import { SandboxInitializationError, sandboxInitializationFailedMessage, SandboxUnavailableError } from '../providers/errors.js';
import { sandboxService } from '../sandbox-service.js';
import { FunctionError } from './helpers.js';

import type { CreateSandboxParams, Sandbox } from '../providers/types.js';

export { sandboxInitializationFailedMessage } from '../providers/errors.js';

export const executionEnvironmentUnavailableMessage = 'The function execution environment is temporarily unavailable. Please try again shortly.';

export async function createFunctionSandbox(params: CreateSandboxParams): Promise<Sandbox> {
    try {
        return await sandboxService.create(params);
    } catch (err) {
        const functionError = toFunctionSandboxError(err);
        if (functionError) {
            throw functionError;
        }

        throw err;
    }
}

export function toFunctionSandboxError(error: unknown): FunctionError | null {
    if (error instanceof SandboxUnavailableError) {
        return new FunctionError({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        });
    }

    if (error instanceof SandboxInitializationError) {
        return new FunctionError({
            code: 'server_error',
            message: sandboxInitializationFailedMessage,
            status: 500
        });
    }

    return null;
}
