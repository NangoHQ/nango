import { describe, expect, it, vi } from 'vitest';

import { SandboxUnavailableError, sandboxInitializationFailedMessage } from './providers/errors.js';
import { SandboxService } from './sandbox-service.js';

import type { SandboxInitializationError } from './providers/errors.js';
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
    it('preserves sandbox unavailable errors', async () => {
        const error = new SandboxUnavailableError('capacity exceeded');
        const provider = createProvider({
            create: vi.fn().mockRejectedValue(error)
        });
        const service = new SandboxService(provider);

        await expect(service.create({ purpose: 'dryrun', timeoutMs: 30_000 })).rejects.toBe(error);
    });

    it('wraps unexpected sandbox creation errors in a generic sandbox initialization error', async () => {
        const cause = new Error('E2B_API_KEY is required for the E2B dryrun runtime');
        const provider = createProvider({
            create: vi.fn().mockRejectedValue(cause)
        });
        const service = new SandboxService(provider);

        await expect(service.create({ purpose: 'dryrun', timeoutMs: 30_000 })).rejects.toMatchObject({
            name: 'SandboxInitializationError',
            message: sandboxInitializationFailedMessage,
            cause
        } satisfies Partial<SandboxInitializationError>);
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
        await service.cleanup({ sandboxId: undefined });

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
});
