import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SandboxUnavailableError } from '../providers/errors.js';
import { buildAsyncDryrunScript, prepareAsyncDryrun } from './dryrun-client.js';
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
    connection_id: 'conn-1',
    nango_secret_key: 'nango-secret',
    nango_host: 'https://api.example.test'
};
const asyncDryrunScriptPath = '.nango/runtime/nango-function-dryrun.mjs';
const dryrunInputPath = '.nango/runtime/nango-dryrun-input.json';
const dryrunMetadataPath = '.nango/runtime/nango-dryrun-metadata.json';
const dryrunCheckpointPath = '.nango/runtime/nango-dryrun-checkpoint.json';

describe('sandboxed function dryrun client', () => {
    beforeEach(() => {
        mocks.create.mockResolvedValue(mocks.sandbox);
        mocks.writeFiles.mockResolvedValue(undefined);
        mocks.startCommand.mockResolvedValue(undefined);
        mocks.stop.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
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

        expect(prepared.sandboxId).toBe(mocks.sandbox.id);
        expect(mocks.writeFiles).toHaveBeenCalledWith([
            { path: 'github/actions/listRepos.ts', contents: 'export default {}' },
            { path: 'index.ts', contents: "import './github/actions/listRepos.js';\n" },
            { path: asyncDryrunScriptPath, contents: expect.stringContaining('NANGO_DRYRUN_CALLBACK_URL') },
            { path: dryrunInputPath, contents: JSON.stringify({ ok: true }) },
            { path: dryrunMetadataPath, contents: JSON.stringify({ source: 'test' }) },
            { path: dryrunCheckpointPath, contents: JSON.stringify({ cursor: 'abc' }) }
        ]);

        await prepared.start();

        expect(mocks.startCommand).toHaveBeenCalledWith({
            command: `node ${asyncDryrunScriptPath}`,
            timeoutMs: 0,
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
                    `@${dryrunInputPath}`,
                    '--metadata',
                    `@${dryrunMetadataPath}`,
                    '--checkpoint',
                    `@${dryrunCheckpointPath}`
                ])
            })
        });
    });

    it('returns execution_environment_unavailable when the async dryrun sandbox cannot be created', async () => {
        mocks.create.mockRejectedValueOnce(new SandboxUnavailableError('Function execution environment unavailable'));

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
        } satisfies Partial<FunctionError>);

        expect(mocks.writeFiles).not.toHaveBeenCalled();
        expect(mocks.stop).not.toHaveBeenCalled();
    });

    it('builds a callback script that reports dryrun compile exit codes as compilation errors', () => {
        expect(buildAsyncDryrunScript()).toContain("code: dryrun.exitCode === compileExitCode ? 'compilation_error' : 'dryrun_error'");
        expect(buildAsyncDryrunScript()).toContain("'Nango-Is-Script': 'true'");
    });
});
