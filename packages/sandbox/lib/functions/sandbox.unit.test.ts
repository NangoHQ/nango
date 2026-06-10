import { RateLimitError, Sandbox } from 'e2b';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    cleanupFunctionSandbox,
    createFunctionSandbox,
    executionEnvironmentUnavailableMessage,
    getRunningSandboxCount,
    toExecutionEnvironmentUnavailableError
} from './sandbox.js';

import type { FunctionError } from './helpers.js';

describe('sandbox helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps E2B rate limit errors to execution environment unavailable', async () => {
        const create = vi.spyOn(Sandbox, 'create').mockRejectedValueOnce(new RateLimitError('Rate limit exceeded - too many sandboxes'));

        await expect(
            createFunctionSandbox({
                apiKey: 'e2b-key',
                purpose: 'dryrun',
                timeoutMs: 30_000,
                metadata: { dryrunId: 'dryrun-id' }
            })
        ).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<FunctionError>);

        expect(create).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                apiKey: 'e2b-key',
                timeoutMs: 30_000,
                allowInternetAccess: true,
                metadata: expect.objectContaining({
                    dryrunId: 'dryrun-id',
                    purpose: 'dryrun',
                    requestId: expect.any(String)
                }),
                network: { allowPublicTraffic: true }
            })
        );
    });

    it('counts all running sandboxes from the E2B paginator', async () => {
        const pages = [[{ sandboxId: 'sandbox-1' }, { sandboxId: 'sandbox-2' }], [{ sandboxId: 'sandbox-3' }]];
        let pageIndex = 0;
        const paginator = {
            get hasNext() {
                return pageIndex < pages.length;
            },
            nextItems: vi.fn(() => Promise.resolve(pages[pageIndex++] ?? []))
        };
        const list = vi.spyOn(Sandbox, 'list').mockReturnValue(paginator as unknown as ReturnType<typeof Sandbox.list>);

        const count = await getRunningSandboxCount({ apiKey: 'e2b-key', requestTimeoutMs: 5_000 });

        expect(count).toBe(3);
        expect(list).toHaveBeenCalledWith({
            apiKey: 'e2b-key',
            requestTimeoutMs: 5_000,
            query: { state: ['running'] }
        });
        expect(paginator.nextItems).toHaveBeenCalledTimes(2);
    });

    it('cleans up a sandbox by id', async () => {
        const kill = vi.spyOn(Sandbox, 'kill').mockResolvedValueOnce(true);

        await cleanupFunctionSandbox({ sandboxId: 'sandbox-id', apiKey: 'e2b-key' });

        expect(kill).toHaveBeenCalledWith('sandbox-id', { apiKey: 'e2b-key' });
    });

    it('skips sandbox cleanup when there is no remote sandbox to kill', async () => {
        const kill = vi.spyOn(Sandbox, 'kill').mockResolvedValue(true);

        await cleanupFunctionSandbox({ sandboxId: null, apiKey: 'e2b-key' });
        await cleanupFunctionSandbox({ sandboxId: 'local', apiKey: 'e2b-key' });
        await cleanupFunctionSandbox({ sandboxId: 'sandbox-id', apiKey: undefined });

        expect(kill).not.toHaveBeenCalled();
    });

    it('does not throw when sandbox cleanup fails', async () => {
        const kill = vi.spyOn(Sandbox, 'kill').mockRejectedValueOnce(new Error('sandbox not found'));

        await expect(cleanupFunctionSandbox({ sandboxId: 'sandbox-id', apiKey: 'e2b-key' })).resolves.toBeUndefined();

        expect(kill).toHaveBeenCalledWith('sandbox-id', { apiKey: 'e2b-key' });
    });

    it('maps sandbox capacity-shaped errors without exposing provider details', () => {
        expect(toExecutionEnvironmentUnavailableError({ status: 429, message: 'too many sandboxes in parallel' })).toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<FunctionError>);

        expect(toExecutionEnvironmentUnavailableError(new Error('Concurrent sandboxes quota exceeded'))).toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<FunctionError>);
    });

    it('leaves unrelated sandbox errors unchanged', () => {
        expect(toExecutionEnvironmentUnavailableError(new Error('Sandbox failed to write file'))).toBeNull();
    });
});
