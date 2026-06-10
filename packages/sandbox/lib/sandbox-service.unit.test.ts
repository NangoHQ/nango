import { describe, expect, it, vi } from 'vitest';

import { SandboxUnavailableError } from './providers/errors.js';
import { SandboxService, executionEnvironmentUnavailableMessage, toExecutionEnvironmentUnavailableError } from './sandbox-service.js';

import type { FunctionError } from './functions/helpers.js';
import type { SandboxProvider } from './providers/types.js';

function createProvider(overrides: Partial<SandboxProvider> = {}): SandboxProvider {
    return {
        name: 'e2b',
        create: vi.fn(),
        cleanup: vi.fn(),
        ...overrides
    };
}

describe('SandboxService', () => {
    it('maps sandbox unavailable errors to function API errors', async () => {
        const provider = createProvider({
            create: vi.fn().mockRejectedValue(new SandboxUnavailableError('capacity exceeded'))
        });
        const service = new SandboxService(provider);

        await expect(service.create({ purpose: 'dryrun', timeoutMs: 30_000 })).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<FunctionError>);
    });

    it('cleans up sandboxes through the configured provider', async () => {
        const cleanup = vi.fn().mockResolvedValue(undefined);
        const service = new SandboxService(createProvider({ cleanup }));

        await service.cleanup({ sandboxId: 'sandbox-id' });

        expect(cleanup).toHaveBeenCalledWith('sandbox-id');
    });

    it('skips cleanup when there is no sandbox to clean up', async () => {
        const cleanup = vi.fn();
        const service = new SandboxService(createProvider({ cleanup }));

        await service.cleanup({ sandboxId: null });
        await service.cleanup({ sandboxId: 'local' });

        expect(cleanup).not.toHaveBeenCalled();
    });

    it('does not throw when sandbox cleanup fails', async () => {
        const service = new SandboxService(
            createProvider({
                cleanup: vi.fn().mockRejectedValue(new Error('sandbox not found'))
            })
        );

        await expect(service.cleanup({ sandboxId: 'sandbox-id' })).resolves.toBeUndefined();
    });

    it('does not map provider-shaped errors directly', () => {
        expect(toExecutionEnvironmentUnavailableError({ status: 429, message: 'too many sandboxes in parallel' })).toBeNull();
    });

    it('leaves unrelated errors unchanged', () => {
        expect(toExecutionEnvironmentUnavailableError(new Error('Sandbox failed to write file'))).toBeNull();
    });
});
