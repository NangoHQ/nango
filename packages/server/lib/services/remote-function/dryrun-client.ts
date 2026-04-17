import { randomUUID } from 'node:crypto';

import { CommandExitError, Sandbox, TimeoutError } from 'e2b';

import { isLocal } from '@nangohq/utils';

import { buildDryrunArgs } from './command-builders.js';
import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { RemoteFunctionError } from './helpers.js';
import {
    remoteFunctionCompileTimeoutMs,
    remoteFunctionCompilerTemplate,
    remoteFunctionDryrunSandboxTimeoutMs,
    remoteFunctionDryrunTimeoutMs,
    remoteFunctionProjectPath
} from './runtime.js';
import { buildShellCommand } from './shell.js';
import { invokeLocalDryrun } from '../local/dryrun-client.js';

export interface DryrunRequest {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
    code: string;
    environment_name: string;
    connection_id: string;
    nango_secret_key: string;
    nango_host: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
    checkpoint?: Record<string, unknown>;
    last_sync_date?: string;
}

export interface DryrunResult {
    output: string;
}

export async function invokeDryrun(request: DryrunRequest): Promise<DryrunResult> {
    if (isLocal) {
        return invokeLocalDryrun(request);
    }

    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B dryrun runtime');
    }

    const sandbox = await Sandbox.create(remoteFunctionCompilerTemplate, {
        timeoutMs: remoteFunctionDryrunSandboxTimeoutMs,
        allowInternetAccess: true,
        metadata: { purpose: 'nango-dryrun', requestId: randomUUID() },
        network: { allowPublicTraffic: true },
        apiKey
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.files.write(`${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await sandbox.files.write(`${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));

        try {
            await sandbox.commands.run('nango compile', {
                cwd: remoteFunctionProjectPath,
                timeoutMs: remoteFunctionCompileTimeoutMs,
                envs: { NO_COLOR: '1' }
            });
        } catch (err) {
            if (err instanceof CommandExitError) {
                throw new RemoteFunctionError({ code: 'compilation_error', message: err.stderr || err.stdout || 'Compilation failed', status: 400 });
            }
            if (err instanceof TimeoutError) {
                throw new RemoteFunctionError({ code: 'timeout', message: 'Compilation timed out', status: 504 });
            }
            throw err;
        }

        if (request.input !== undefined) {
            await sandbox.files.write('/tmp/nango-dryrun-input.json', JSON.stringify(request.input));
        }
        if (request.metadata) {
            await sandbox.files.write('/tmp/nango-dryrun-metadata.json', JSON.stringify(request.metadata));
        }
        if (request.checkpoint) {
            await sandbox.files.write('/tmp/nango-dryrun-checkpoint.json', JSON.stringify(request.checkpoint));
        }

        const envs = {
            NO_COLOR: '1',
            NANGO_SECRET_KEY: request.nango_secret_key,
            NANGO_HOSTPORT: request.nango_host
        };
        const command = buildShellCommand(['nango', ...buildDryrunArgs(request)]);

        try {
            const result = await sandbox.commands.run(command, {
                cwd: remoteFunctionProjectPath,
                timeoutMs: remoteFunctionDryrunTimeoutMs,
                envs
            });
            return { output: result.stdout };
        } catch (err) {
            if (err instanceof CommandExitError) {
                throw new RemoteFunctionError({ code: 'dryrun_error', message: err.stdout || err.stderr || JSON.stringify(err), status: 400 });
            }
            if (err instanceof TimeoutError) {
                throw new RemoteFunctionError({ code: 'timeout', message: 'Dry run timed out', status: 504 });
            }
            throw err;
        }
    } finally {
        await sandbox.kill().catch(() => {});
    }
}
