import { afterEach, describe, expect, it, vi } from 'vitest';

import { SandboxInitializationError, SandboxUnavailableError } from '../providers/errors.js';
import { invokeCompiler } from './compiler-client.js';
import { executionEnvironmentUnavailableMessage, sandboxInitializationFailedMessage } from './sandbox.js';

import type { FunctionError } from './helpers.js';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../sandbox-service.js', () => ({ sandboxService: { create: mocks.create } }));

describe('sandboxed function compiler client errors', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns execution_environment_unavailable when the compiler sandbox cannot be created', async () => {
        mocks.create.mockRejectedValueOnce(new SandboxUnavailableError('Function execution environment unavailable'));

        await expect(invokeCompiler({ code: 'export default {}' })).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<FunctionError>);
    });

    it('returns a generic server_error when the sandbox provider is misconfigured', async () => {
        const cause = new Error('AGENTCORE_RUNTIME_ARN is required for the AgentCore sandbox provider');
        mocks.create.mockRejectedValueOnce(new SandboxInitializationError({ cause }));

        await expect(invokeCompiler({ code: 'export default {}' })).rejects.toMatchObject({
            code: 'server_error',
            message: sandboxInitializationFailedMessage,
            status: 500
        } satisfies Partial<FunctionError>);
    });
});
