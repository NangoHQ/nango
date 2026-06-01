import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { invokeCompiler } from './compiler-client.js';
import { executionEnvironmentUnavailableMessage } from './sandbox.js';

import type { RemoteFunctionError } from './helpers.js';

const mocks = vi.hoisted(() => {
    class CommandExitError extends Error {}

    class RateLimitError extends Error {}

    class TimeoutError extends Error {}

    const create = vi.fn();

    return { CommandExitError, RateLimitError, TimeoutError, create };
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

describe('remote function compiler client E2B errors', () => {
    beforeEach(() => {
        vi.stubEnv('E2B_API_KEY', 'e2b-key');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it('returns execution_environment_unavailable when the compiler sandbox cannot be created', async () => {
        mocks.create.mockRejectedValueOnce(new mocks.RateLimitError('Rate limit exceeded - too many sandboxes'));

        await expect(invokeCompiler({ code: 'export default {}' })).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<RemoteFunctionError>);
    });
});
