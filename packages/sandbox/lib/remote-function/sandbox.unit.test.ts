import { RateLimitError, Sandbox } from 'e2b';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRemoteFunctionSandbox, executionEnvironmentUnavailableMessage, toExecutionEnvironmentUnavailableError } from './sandbox.js';

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
                purpose: 'nango-dryrun',
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
                    purpose: 'nango-dryrun',
                    requestId: expect.any(String)
                }),
                network: { allowPublicTraffic: true }
            })
        );
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
