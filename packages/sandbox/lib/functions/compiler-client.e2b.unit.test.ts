import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    class CommandExitError extends Error {}

    class RateLimitError extends Error {}

    class TimeoutError extends Error {}

    const create = vi.fn();
    const envs = { E2B_API_KEY: 'e2b-key' as string | undefined };

    return { CommandExitError, RateLimitError, TimeoutError, create, envs };
});

vi.mock('e2b', () => ({
    CommandExitError: mocks.CommandExitError,
    RateLimitError: mocks.RateLimitError,
    Sandbox: { create: mocks.create },
    TimeoutError: mocks.TimeoutError
}));

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();

    if (!actual || typeof actual !== 'object') {
        throw new Error('Invalid @nangohq/utils mock');
    }

    return { ...actual, isLocal: false };
});
vi.mock('../env.js', () => ({ envs: mocks.envs }));

import { invokeCompiler } from './compiler-client.js';
import { executionEnvironmentUnavailableMessage, sandboxInitializationFailedMessage } from './sandbox.js';

import type { FunctionError } from './helpers.js';

describe('sandboxed function compiler client E2B errors', () => {
    beforeEach(() => {
        mocks.envs.E2B_API_KEY = 'e2b-key';
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns execution_environment_unavailable when the compiler sandbox cannot be created', async () => {
        mocks.create.mockRejectedValueOnce(new mocks.RateLimitError('Rate limit exceeded - too many sandboxes'));

        await expect(invokeCompiler({ code: 'export default {}' })).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<FunctionError>);
    });

    it('returns a generic server_error when the sandbox provider is misconfigured', async () => {
        mocks.envs.E2B_API_KEY = undefined;

        await expect(invokeCompiler({ code: 'export default {}' })).rejects.toMatchObject({
            code: 'server_error',
            message: sandboxInitializationFailedMessage,
            status: 500
        } satisfies Partial<FunctionError>);
    });
});
