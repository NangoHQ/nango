import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    class CommandExitError extends Error {
        stdout: string | undefined;
        stderr: string | undefined;
        exitCode: number;

        constructor(message: string, stdout?: string, stderr?: string, exitCode = 1) {
            super(message);
            this.stdout = stdout;
            this.stderr = stderr;
            this.exitCode = exitCode;
        }
    }

    class RateLimitError extends Error {}

    class TimeoutError extends Error {}

    const run = vi.fn();
    const write = vi.fn();
    const kill = vi.fn();
    const sandbox = {
        sandboxId: 'sandbox-id',
        commands: { run },
        files: { write },
        kill
    };
    const create = vi.fn();

    return { CommandExitError, RateLimitError, TimeoutError, create, kill, run, sandbox, write };
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

import { NangoCliExitCode } from './cli-exit-codes.js';
import { buildAsyncDryrunScript, invokeDryrun, prepareAsyncDryrun } from './dryrun-client.js';
import { executionEnvironmentUnavailableMessage } from './sandbox.js';

import type { RemoteFunctionError } from './helpers.js';

const request = {
    integration_id: 'github',
    function_name: 'listRepos',
    function_type: 'action' as const,
    code: 'export default {}',
    environment_name: 'dev',
    connection_id: 'conn-1',
    nango_secret_key: 'nango-secret',
    nango_host: 'https://api.example.test'
};

describe('remote function dryrun client', () => {
    beforeEach(() => {
        vi.stubEnv('E2B_API_KEY', 'e2b-key');
        mocks.create.mockResolvedValue(mocks.sandbox);
        mocks.write.mockResolvedValue(undefined);
        mocks.kill.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it('returns dryrun output when the command succeeds even if stderr contains error-like text', async () => {
        mocks.run.mockResolvedValueOnce({ stdout: '', stderr: '' }).mockResolvedValueOnce({
            stdout: 'Executing -> integration:"github" script:"listRepos"\nDone\n{"ok":true}\n',
            stderr: 'An error occurred during execution\nthis text is ignored when the command exits 0\n'
        });

        const result = await invokeDryrun(request);

        expect(result).toStrictEqual({
            output: 'Executing -> integration:"github" script:"listRepos"\nDone\n{"ok":true}'
        });
    });

    it('returns a dryrun_error when the dryrun command exits non-zero', async () => {
        mocks.run
            .mockResolvedValueOnce({ stdout: '', stderr: '' })
            .mockRejectedValueOnce(new mocks.CommandExitError('command failed', 'stdout failure', 'stderr failure', NangoCliExitCode.DryrunError));

        await expect(invokeDryrun(request)).rejects.toMatchObject({
            code: 'dryrun_error',
            message: 'stdout failure\nstderr failure',
            status: 400
        } satisfies Partial<RemoteFunctionError>);
    });

    it('returns a compilation_error when the compile command exits non-zero', async () => {
        mocks.run.mockRejectedValueOnce(new mocks.CommandExitError('command failed', 'type error details', 'Found 1 error'));

        await expect(invokeDryrun(request)).rejects.toMatchObject({
            code: 'compilation_error',
            message: 'type error details\nFound 1 error',
            status: 400
        } satisfies Partial<RemoteFunctionError>);

        expect(mocks.run).toHaveBeenCalledTimes(1);
    });

    it('returns a compilation_error when dryrun exits with the compile phase exit code', async () => {
        mocks.run
            .mockResolvedValueOnce({ stdout: '', stderr: '' })
            .mockRejectedValueOnce(new mocks.CommandExitError('command failed', 'type error details', 'Found 1 error', NangoCliExitCode.CompileError));

        await expect(invokeDryrun(request)).rejects.toMatchObject({
            code: 'compilation_error',
            message: 'type error details\nFound 1 error',
            status: 400
        } satisfies Partial<RemoteFunctionError>);
    });

    it('returns execution_environment_unavailable when the dryrun sandbox cannot be created', async () => {
        mocks.create.mockRejectedValueOnce(new mocks.RateLimitError('Rate limit exceeded - too many sandboxes'));

        await expect(invokeDryrun(request)).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<RemoteFunctionError>);

        expect(mocks.write).not.toHaveBeenCalled();
        expect(mocks.kill).not.toHaveBeenCalled();
    });

    it('prepares an async dryrun sandbox and starts the callback script in the background', async () => {
        const prepared = await prepareAsyncDryrun({
            ...request,
            dryrun_id: '7b539769-6d39-4442-89fc-33fbac96ea66',
            callback_url: 'https://api.example.test/functions/dryruns/7b539769-6d39-4442-89fc-33fbac96ea66/result',
            input: { ok: true },
            metadata: { source: 'test' },
            checkpoint: { cursor: 'abc' }
        });

        expect(prepared.sandboxId).toBe(mocks.sandbox.sandboxId);
        expect(mocks.write).toHaveBeenCalledWith('/home/user/nango-integrations/github/actions/listRepos.ts', 'export default {}');
        expect(mocks.write).toHaveBeenCalledWith('/home/user/nango-integrations/index.ts', "import './github/actions/listRepos.js';\n");
        expect(mocks.write).toHaveBeenCalledWith('/tmp/nango-dryrun-input.json', JSON.stringify({ ok: true }));
        expect(mocks.write).toHaveBeenCalledWith('/tmp/nango-dryrun-metadata.json', JSON.stringify({ source: 'test' }));
        expect(mocks.write).toHaveBeenCalledWith('/tmp/nango-dryrun-checkpoint.json', JSON.stringify({ cursor: 'abc' }));
        expect(mocks.write).toHaveBeenCalledWith('/tmp/nango-function-dryrun.mjs', expect.stringContaining('NANGO_DRYRUN_CALLBACK_URL'));

        await prepared.start();

        expect(mocks.run).toHaveBeenCalledWith('node /tmp/nango-function-dryrun.mjs', {
            cwd: '/home/user/nango-integrations',
            background: true,
            timeoutMs: 30_000,
            envs: expect.objectContaining({
                NANGO_DRYRUN_CALLBACK_URL: 'https://api.example.test/functions/dryruns/7b539769-6d39-4442-89fc-33fbac96ea66/result',
                NANGO_DRYRUN_ARGS: JSON.stringify([
                    'dryrun',
                    'listRepos',
                    'conn-1',
                    '--environment',
                    'dev',
                    '--integration-id',
                    'github',
                    '--auto-confirm',
                    '--no-interactive',
                    '--input',
                    '@/tmp/nango-dryrun-input.json',
                    '--metadata',
                    '@/tmp/nango-dryrun-metadata.json',
                    '--checkpoint',
                    '@/tmp/nango-dryrun-checkpoint.json'
                ])
            })
        });
    });

    it('returns execution_environment_unavailable when the async dryrun sandbox cannot be created', async () => {
        mocks.create.mockRejectedValueOnce(new mocks.RateLimitError('Rate limit exceeded - too many sandboxes'));

        await expect(
            prepareAsyncDryrun({
                ...request,
                dryrun_id: '7b539769-6d39-4442-89fc-33fbac96ea66',
                callback_url: 'https://api.example.test/functions/dryruns/7b539769-6d39-4442-89fc-33fbac96ea66/result'
            })
        ).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<RemoteFunctionError>);

        expect(mocks.write).not.toHaveBeenCalled();
        expect(mocks.kill).not.toHaveBeenCalled();
    });

    it('builds a callback script that reports dryrun compile exit codes as compilation errors', () => {
        expect(buildAsyncDryrunScript()).toContain("code: dryrun.exitCode === compileExitCode ? 'compilation_error' : 'dryrun_error'");
        expect(buildAsyncDryrunScript()).toContain("'Nango-Is-Script': 'true'");
    });
});
