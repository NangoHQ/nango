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

    class TimeoutError extends Error {}

    const run = vi.fn();
    const write = vi.fn();
    const kill = vi.fn();
    const sandbox = {
        commands: { run },
        files: { write },
        kill
    };
    const create = vi.fn();

    return { CommandExitError, TimeoutError, create, kill, run, sandbox, write };
});

vi.mock('e2b', () => ({
    CommandExitError: mocks.CommandExitError,
    Sandbox: { create: mocks.create },
    TimeoutError: mocks.TimeoutError
}));

vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, isLocal: false };
});

import { NANGO_CLI_COMPILE_ERROR_EXIT_CODE, NANGO_CLI_DEPLOY_ERROR_EXIT_CODE } from './cli-exit-codes.js';
import { invokeDeploy } from './deploy-client.js';

import type { RemoteFunctionError } from './helpers.js';

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
        vi.stubEnv('E2B_API_KEY', 'e2b-key');
        mocks.create.mockResolvedValue(mocks.sandbox);
        mocks.write.mockResolvedValue(undefined);
        mocks.kill.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it('returns a compilation_error when deploy exits with the compile phase exit code', async () => {
        mocks.run.mockRejectedValueOnce(new mocks.CommandExitError('command failed', 'type error details', 'Found 1 error', NANGO_CLI_COMPILE_ERROR_EXIT_CODE));

        await expect(invokeDeploy(request)).rejects.toMatchObject({
            code: 'compilation_error',
            message: 'type error details\nFound 1 error',
            status: 400
        } satisfies Partial<RemoteFunctionError>);

        expect(mocks.run).toHaveBeenCalledTimes(1);
        expect(mocks.run.mock.calls[0]?.[0]).toContain("'deploy'");
    });

    it('returns a deployment_error when deploy exits with the deploy phase exit code regardless of output text', async () => {
        mocks.run.mockRejectedValueOnce(
            new mocks.CommandExitError('command failed', 'Found 1 error from deployment API', '', NANGO_CLI_DEPLOY_ERROR_EXIT_CODE)
        );

        await expect(invokeDeploy(request)).rejects.toMatchObject({
            code: 'deployment_error',
            message: 'Found 1 error from deployment API',
            status: 400
        } satisfies Partial<RemoteFunctionError>);

        expect(mocks.run).toHaveBeenCalledTimes(1);
    });
});
