import { RateLimitError, Sandbox } from 'e2b';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createRemoteFunctionSandbox,
    executionEnvironmentUnavailableMessage,
    getRunningSandboxCount,
    toExecutionEnvironmentUnavailableError
} from './sandbox.js';

import type { RemoteFunctionError } from './helpers.js';

describe('remote function sandbox helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps E2B rate limit errors to execution environment unavailable', async () => {
        const create = vi.spyOn(Sandbox, 'create').mockRejectedValueOnce(new RateLimitError('Rate limit exceeded - too many sandboxes'));

        await expect(
            createRemoteFunctionSandbox({
                apiKey: 'e2b-key',
                purpose: 'nango-function-dryrun',
                timeoutMs: 30_000,
                metadata: { dryrunId: 'dryrun-id' }
            })
        ).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<RemoteFunctionError>);

        expect(create).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                apiKey: 'e2b-key',
                timeoutMs: 30_000,
                allowInternetAccess: true,
                metadata: expect.objectContaining({
                    dryrunId: 'dryrun-id',
                    purpose: 'nango-function-dryrun',
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

    it('maps sandbox capacity-shaped errors without exposing provider details', () => {
        expect(toExecutionEnvironmentUnavailableError({ status: 429, message: 'too many sandboxes in parallel' })).toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<RemoteFunctionError>);

        expect(toExecutionEnvironmentUnavailableError(new Error('Concurrent sandboxes quota exceeded'))).toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<RemoteFunctionError>);
    });

    it('leaves unrelated sandbox errors unchanged', () => {
        expect(toExecutionEnvironmentUnavailableError(new Error('Sandbox failed to write file'))).toBeNull();
    });
});
