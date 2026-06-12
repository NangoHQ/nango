import { readFileSync } from 'node:fs';

import { NangoCliExitCode } from './cli-exit-codes.js';
import { buildDryrunArgs } from './command-builders.js';
import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { compileTimeoutMs, dryrunSandboxTimeoutMs, dryrunTimeoutMs } from './timeouts.js';
import { sandboxService } from '../sandbox-service.js';

const asyncDryrunScriptUrl = new URL('./async-dryrun-script.js', import.meta.url);
const asyncDryrunScript = readFileSync(asyncDryrunScriptUrl, 'utf8');

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

export interface AsyncDryrunRequest extends DryrunRequest {
    dryrun_id: string;
    callback_url: string;
}

export interface PreparedAsyncDryrun {
    sandboxId: string;
    startedAt: Date;
    executionTimeoutAt: Date;
    start: () => Promise<void>;
    kill: () => Promise<void>;
}

export async function prepareAsyncDryrun(request: AsyncDryrunRequest): Promise<PreparedAsyncDryrun> {
    const sandbox = await sandboxService.create({
        purpose: 'dryrun',
        timeoutMs: dryrunSandboxTimeoutMs,
        metadata: { dryrunId: request.dryrun_id }
    });

    try {
        const { tsFilePath } = getFilePaths(request);
        const files = [
            { path: tsFilePath, contents: request.code },
            { path: 'index.ts', contents: buildIndexTs(request) },
            { path: '/tmp/nango-function-dryrun.mjs', contents: buildAsyncDryrunScript() }
        ];

        if (request.input !== undefined) {
            files.push({ path: '/tmp/nango-dryrun-input.json', contents: JSON.stringify(request.input) });
        }
        if (request.metadata) {
            files.push({ path: '/tmp/nango-dryrun-metadata.json', contents: JSON.stringify(request.metadata) });
        }
        if (request.checkpoint) {
            files.push({ path: '/tmp/nango-dryrun-checkpoint.json', contents: JSON.stringify(request.checkpoint) });
        }

        await sandbox.writeFiles(files);

        const startedAt = new Date();
        const executionTimeoutAt = new Date(startedAt.getTime() + dryrunSandboxTimeoutMs);

        return {
            sandboxId: sandbox.id,
            startedAt,
            executionTimeoutAt,
            start: async () => {
                await sandbox.startCommand({
                    command: 'node /tmp/nango-function-dryrun.mjs',
                    timeoutMs: 0,
                    envs: {
                        NO_COLOR: '1',
                        NANGO_SECRET_KEY: request.nango_secret_key,
                        NANGO_HOSTPORT: request.nango_host,
                        NANGO_DRYRUN_CALLBACK_URL: request.callback_url,
                        NANGO_DRYRUN_ARGS: JSON.stringify(buildDryrunArgs(request)),
                        NANGO_DRYRUN_COMPILE_TIMEOUT_MS: String(compileTimeoutMs),
                        NANGO_DRYRUN_TIMEOUT_MS: String(dryrunTimeoutMs),
                        NANGO_DRYRUN_COMPILE_EXIT_CODE: String(NangoCliExitCode.CompileError)
                    }
                });
            },
            kill: async () => {
                await sandbox.stop().catch(() => undefined);
            }
        };
    } catch (err) {
        await sandbox.stop().catch(() => undefined);
        throw err;
    }
}

export function buildAsyncDryrunScript(): string {
    return asyncDryrunScript;
}
