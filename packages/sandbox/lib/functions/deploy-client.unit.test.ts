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
    const envs = { E2B_API_KEY: 'e2b-key' as string | undefined };

    return { CommandExitError, RateLimitError, TimeoutError, create, envs, kill, run, sandbox, write };
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

import { NangoCliExitCode } from './cli-exit-codes.js';
import { buildAsyncDeployScript, invokeDeploy, prepareAsyncDeploy } from './deploy-client.js';
import { executionEnvironmentUnavailableMessage } from './sandbox.js';

import type { FunctionError } from './helpers.js';

const request = {
    integration_id: 'github',
    function_name: 'listRepos',
    function_type: 'action' as const,
    code: 'export default {}',
    environment_name: 'dev',
    nango_secret_key: 'nango-secret',
    nango_host: 'https://api.example.test'
};

describe('remote function deploy client', () => {
    beforeEach(() => {
        mocks.envs.E2B_API_KEY = 'e2b-key';
        mocks.create.mockResolvedValue(mocks.sandbox);
        mocks.write.mockResolvedValue(undefined);
        mocks.kill.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('prepares an async deploy sandbox and starts the callback script in the background', async () => {
        const prepared = await prepareAsyncDeploy({
            ...request,
            deployment_id: '7b539769-6d39-4442-89fc-33fbac96ea66',
            callback_url: 'https://api.example.test/functions/deployments/7b539769-6d39-4442-89fc-33fbac96ea66/result',
            version: '1.0.0',
            allow_destructive: true
        });

        expect(prepared.sandboxId).toBe(mocks.sandbox.sandboxId);
        expect(mocks.write).toHaveBeenCalledWith('/home/user/nango-integrations/github/actions/listRepos.ts', 'export default {}');
        expect(mocks.write).toHaveBeenCalledWith('/home/user/nango-integrations/index.ts', "import './github/actions/listRepos.js';\n");
        expect(mocks.write).toHaveBeenCalledWith('/tmp/nango-function-deploy.mjs', expect.stringContaining('NANGO_DEPLOY_CALLBACK_URL'));

        await prepared.start();

        expect(mocks.run).toHaveBeenCalledWith('node /tmp/nango-function-deploy.mjs', {
            cwd: '/home/user/nango-integrations',
            background: true,
            timeoutMs: 30_000,
            envs: expect.objectContaining({
                NANGO_DEPLOY_CALLBACK_URL: 'https://api.example.test/functions/deployments/7b539769-6d39-4442-89fc-33fbac96ea66/result',
                NANGO_DEPLOY_ARGS: JSON.stringify([
                    'deploy',
                    'dev',
                    '--integration',
                    'github',
                    '--action',
                    'listRepos',
                    '--auto-confirm',
                    '--no-interactive',
                    '--version',
                    '1.0.0',
                    '--allow-destructive'
                ])
            })
        });
    });

    it('returns deploy output when the command succeeds', async () => {
        mocks.run.mockResolvedValueOnce({ stdout: 'Successfully deployed the functions', stderr: '' });

        await expect(invokeDeploy(request)).resolves.toStrictEqual({
            output: 'Successfully deployed the functions'
        });

        expect(mocks.write).toHaveBeenCalledTimes(2);
        expect(mocks.run).toHaveBeenCalledTimes(1);
        expect(mocks.kill).toHaveBeenCalledTimes(1);
    });

    it('returns a compilation_error when deploy exits with the compile phase exit code', async () => {
        mocks.run.mockRejectedValueOnce(new mocks.CommandExitError('command failed', 'type error details', 'Found 1 error', NangoCliExitCode.CompileError));

        await expect(invokeDeploy(request)).rejects.toMatchObject({
            code: 'compilation_error',
            message: 'type error details\nFound 1 error',
            status: 400
        } satisfies Partial<FunctionError>);

        expect(mocks.run).toHaveBeenCalledTimes(1);
        expect(mocks.run.mock.calls[0]?.[0]).toContain("'deploy'");
    });

    it('returns a deployment_error when deploy exits with the deploy phase exit code regardless of output text', async () => {
        mocks.run.mockRejectedValueOnce(new mocks.CommandExitError('command failed', 'Found 1 error from deployment API', '', NangoCliExitCode.DeployError));

        await expect(invokeDeploy(request)).rejects.toMatchObject({
            code: 'deployment_error',
            message: 'Found 1 error from deployment API',
            status: 400
        } satisfies Partial<FunctionError>);

        expect(mocks.run).toHaveBeenCalledTimes(1);
    });

    it('returns execution_environment_unavailable when the deploy sandbox cannot be created', async () => {
        mocks.create.mockRejectedValueOnce(new mocks.RateLimitError('Rate limit exceeded - too many sandboxes'));

        await expect(invokeDeploy(request)).rejects.toMatchObject({
            code: 'execution_environment_unavailable',
            message: executionEnvironmentUnavailableMessage,
            status: 503
        } satisfies Partial<FunctionError>);

        expect(mocks.write).not.toHaveBeenCalled();
        expect(mocks.kill).not.toHaveBeenCalled();
    });

    it('builds a callback script that reports deploy compile exit codes as compilation errors', () => {
        expect(buildAsyncDeployScript()).toContain("code: deploy.exitCode === compileExitCode ? 'compilation_error' : 'deployment_error'");
        expect(buildAsyncDeployScript()).toContain("'Nango-Is-Script': 'true'");
    });
});
