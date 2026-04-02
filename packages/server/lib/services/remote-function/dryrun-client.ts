import { randomUUID } from 'node:crypto';

import { CommandExitError, Sandbox } from 'e2b';

import { isLocal } from '@nangohq/utils';

import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { agentProjectPath } from '../agent/agent-runtime.js';
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

const compileTimeoutMs = 3 * 60 * 1000;
const dryrunTimeoutMs = 5 * 60 * 1000;
const compilerTemplate = 'blank-workspace:staging';

export async function invokeDryrun(request: DryrunRequest): Promise<DryrunResult> {
    if (isLocal) {
        return invokeLocalDryrun(request);
    }

    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B dryrun runtime');
    }

    const sandbox = await Sandbox.create(compilerTemplate, {
        timeoutMs: dryrunTimeoutMs,
        allowInternetAccess: true,
        metadata: { purpose: 'nango-dryrun', requestId: randomUUID() },
        network: { allowPublicTraffic: true },
        apiKey
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.files.write(`${agentProjectPath}/${tsFilePath}`, request.code);
        await sandbox.files.write(`${agentProjectPath}/index.ts`, buildIndexTs(request));

        // Compile first
        try {
            await sandbox.commands.run('nango compile', {
                cwd: agentProjectPath,
                timeoutMs: compileTimeoutMs,
                envs: { NO_COLOR: '1' }
            });
        } catch (err) {
            if (err instanceof CommandExitError) {
                return { output: err.stderr || err.stdout || 'Compilation failed' };
            }
            throw err;
        }

        // Write optional JSON arg files to avoid shell-quoting issues
        if (request.input !== undefined) {
            await sandbox.files.write('/tmp/nango-dryrun-input.json', JSON.stringify(request.input));
        }
        if (request.metadata) {
            await sandbox.files.write('/tmp/nango-dryrun-metadata.json', JSON.stringify(request.metadata));
        }
        if (request.checkpoint) {
            await sandbox.files.write('/tmp/nango-dryrun-checkpoint.json', JSON.stringify(request.checkpoint));
        }

        const cmd = buildDryrunCommand(request);
        const envs = {
            NO_COLOR: '1',
            NANGO_SECRET_KEY: request.nango_secret_key,
            NANGO_HOSTPORT: request.nango_host
        };

        let output: string;
        try {
            const result = await sandbox.commands.run(cmd, {
                cwd: agentProjectPath,
                timeoutMs: dryrunTimeoutMs,
                envs
            });
            output = result.stdout;
        } catch (err) {
            if (err instanceof CommandExitError) {
                output = err.stdout || err.stderr || JSON.stringify(err);
            } else {
                throw err;
            }
        }

        return { output };
    } finally {
        await sandbox.kill().catch(() => {});
    }
}

function buildDryrunCommand(request: DryrunRequest): string {
    const parts = [
        'nango',
        'dryrun',
        request.function_name,
        request.connection_id,
        `--environment ${request.environment_name}`,
        `--integration-id ${request.integration_id}`,
        '--auto-confirm',
        '--no-interactive'
    ];

    if (request.input !== undefined) {
        parts.push('--input @/tmp/nango-dryrun-input.json');
    }
    if (request.metadata) {
        parts.push('--metadata @/tmp/nango-dryrun-metadata.json');
    }
    if (request.checkpoint) {
        parts.push('--checkpoint @/tmp/nango-dryrun-checkpoint.json');
    }
    if (request.last_sync_date) {
        parts.push(`--lastSyncDate ${request.last_sync_date}`);
    }

    return parts.join(' ');
}
