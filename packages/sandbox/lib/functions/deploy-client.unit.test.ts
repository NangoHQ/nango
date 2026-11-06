import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SandboxUnavailableError } from '../providers/errors.js';
import { buildAsyncDeployScript, prepareAsyncDeploy } from './deploy-client.js';
import { executionEnvironmentUnavailableMessage } from './sandbox.js';

import type { FunctionError } from './helpers.js';

const mocks = vi.hoisted(() => {
    const writeFiles = vi.fn();
    const startCommand = vi.fn();
    const stop = vi.fn();
    const sandbox = {
        id: 'sandbox-id',
        provider: 'agentcore' as const,
        writeFiles,
        readTextFile: vi.fn(),
        runCommand: vi.fn(),
        startCommand,
        stop
    };
    const create = vi.fn();

    return { create, sandbox, startCommand, stop, writeFiles };
});

vi.mock('../sandbox-service.js', () => ({ sandboxService: { create: mocks.create } }));

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
        mocks.create.mockResolvedValue(mocks.sandbox);
        mocks.writeFiles.mockResolvedValue(undefined);
        mocks.startCommand.mockResolvedValue(undefined);
        mocks.stop.mockResolvedValue(undefined);
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

        expect(prepared.sandboxId).toBe(mocks.sandbox.id);
        expect(mocks.writeFiles).toHaveBeenCalledWith([
            { path: 'github/actions/listRepos.ts', contents: 'export default {}' },
            { path: 'index.ts', contents: "import './github/actions/listRepos.js';\n" },
            { path: asyncDeployScriptPath, contents: expect.stringContaining('NANGO_DEPLOY_CALLBACK_URL') }
        ]);

        await prepared.start();

        expect(mocks.startCommand).toHaveBeenCalledWith({
            command: `node ${asyncDeployScriptPath}`,
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
        mocks.create.mockRejectedValueOnce(new SandboxUnavailableError('Function execution environment unavailable'));

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

        expect(mocks.writeFiles).not.toHaveBeenCalled();
        expect(mocks.stop).not.toHaveBeenCalled();
    });

    it('builds a callback script that reports deploy compile exit codes as compilation errors', () => {
        expect(buildAsyncDeployScript()).toContain("code: deploy.exitCode === compileExitCode ? 'compilation_error' : 'deployment_error'");
        expect(buildAsyncDeployScript()).toContain("'Nango-Is-Script': 'true'");
        expect(buildAsyncDeployScript()).toContain('Failed to report deployment result');
        expect(buildAsyncDeployScript()).toContain('Callback error: ');
    });
});
