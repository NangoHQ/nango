import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAsyncDeployScript, prepareAsyncDeploy } from './deploy-client.js';
import { executionEnvironmentUnavailableMessage } from './sandbox.js';

import type { FunctionError } from './helpers.js';

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

const request = {
    integration_id: 'github',
    function_name: 'listRepos',
    function_type: 'action' as const,
    code: 'export default {}',
    environment_name: 'dev',
    nango_secret_key: 'nango-secret',
    nango_host: 'https://api.example.test'
};
const asyncDeployScriptPath = '.nango/runtime/nango-function-deploy.mjs';

describe('sandboxed function deploy client', () => {
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
        expect(mocks.write).toHaveBeenCalledWith(
            `/home/user/nango-integrations/${asyncDeployScriptPath}`,
            expect.stringContaining('NANGO_DEPLOY_CALLBACK_URL')
        );

        await prepared.start();

        expect(mocks.run).toHaveBeenCalledWith(`node ${asyncDeployScriptPath}`, {
            cwd: '/home/user/nango-integrations',
            background: true,
            timeoutMs: 0,
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

    it('returns execution_environment_unavailable when the deploy sandbox cannot be created', async () => {
        mocks.create.mockRejectedValueOnce(new mocks.RateLimitError('Rate limit exceeded - too many sandboxes'));

        await expect(
            prepareAsyncDeploy({
                ...request,
                deployment_id: '7b539769-6d39-4442-89fc-33fbac96ea66',
                callback_url: 'https://api.example.test/functions/deployments/7b539769-6d39-4442-89fc-33fbac96ea66/result'
            })
        ).rejects.toMatchObject({
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
        expect(buildAsyncDeployScript()).toContain('Failed to report deployment result');
        expect(buildAsyncDeployScript()).toContain('Callback error: ');
    });
});
