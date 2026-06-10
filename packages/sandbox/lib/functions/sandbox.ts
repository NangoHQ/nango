import { getLogger } from '@nangohq/utils';

import { E2BSandboxProvider, createE2BRawSandbox, getRunningE2BSandboxCount } from '../providers/e2b.js';
import { executionEnvironmentUnavailableMessage, sandboxService, toExecutionEnvironmentUnavailableError } from '../sandbox-service.js';

import type { SandboxPurpose } from '../providers/types.js';

const logger = getLogger('FunctionSandbox');

export { executionEnvironmentUnavailableMessage, toExecutionEnvironmentUnavailableError };

export type FunctionSandbox = Awaited<ReturnType<typeof createE2BRawSandbox>>;

export type FunctionSandboxPurpose = SandboxPurpose;

export async function cleanupFunctionSandbox(params: { sandboxId: string | null | undefined; apiKey?: string | undefined }): Promise<void> {
    if (Object.hasOwn(params, 'apiKey')) {
        if (!params.sandboxId || params.sandboxId === 'local') {
            return;
        }

        try {
            await new E2BSandboxProvider().cleanup({ sandboxId: params.sandboxId, apiKey: params.apiKey });
        } catch (err) {
            logger.warning('Failed to clean up sandbox', { sandboxId: params.sandboxId, err });
        }
        return;
    }

    await sandboxService.cleanup(params);
}

export async function getRunningSandboxCount({ apiKey, requestTimeoutMs }: { apiKey: string; requestTimeoutMs?: number | undefined }): Promise<number> {
    return getRunningE2BSandboxCount({ apiKey, requestTimeoutMs });
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
        return await createE2BRawSandbox({ apiKey, purpose, timeoutMs, metadata });
    } catch (err) {
        const unavailableError = toExecutionEnvironmentUnavailableError(err);
        if (unavailableError) {
            logger.warning('Function execution environment unavailable', { err });
            throw unavailableError;
        }

        throw err;
    }
}
