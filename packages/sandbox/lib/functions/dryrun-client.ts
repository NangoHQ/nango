import { readFileSync } from 'node:fs';

import { getLogger, isLocal, stringifyError } from '@nangohq/utils';

import { NangoCliExitCode } from './cli-exit-codes.js';
import { buildDryrunArgs } from './command-builders.js';
import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { FunctionError } from './helpers.js';
import { remoteFunctionCompileTimeoutMs, remoteFunctionDryrunSandboxTimeoutMs, remoteFunctionDryrunTimeoutMs, remoteFunctionProjectPath } from './runtime.js';
import { createFunctionSandbox } from './sandbox.js';
import { envs } from '../env.js';
import { invokeLocalDryrun } from '../local/dryrun-client.js';

const asyncDryrunScriptUrl = new URL('./async-dryrun-script.js', import.meta.url);
const asyncDryrunScript = readFileSync(asyncDryrunScriptUrl, 'utf8');
const logger = getLogger('FunctionDryrun');

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
    if (isLocal) {
        return prepareLocalAsyncDryrun(request);
    }

    const apiKey = envs.E2B_API_KEY;
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B dryrun runtime');
    }

    const sandbox = await createFunctionSandbox({
        purpose: 'dryrun',
        timeoutMs: remoteFunctionDryrunSandboxTimeoutMs,
        metadata: { dryrunId: request.dryrun_id },
        apiKey
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.files.write(`${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await sandbox.files.write(`${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));

        if (request.input !== undefined) {
            await sandbox.files.write('/tmp/nango-dryrun-input.json', JSON.stringify(request.input));
        }
        if (request.metadata) {
            await sandbox.files.write('/tmp/nango-dryrun-metadata.json', JSON.stringify(request.metadata));
        }
        if (request.checkpoint) {
            await sandbox.files.write('/tmp/nango-dryrun-checkpoint.json', JSON.stringify(request.checkpoint));
        }

        await sandbox.files.write('/tmp/nango-function-dryrun.mjs', buildAsyncDryrunScript());

        const startedAt = new Date();
        const executionTimeoutAt = new Date(startedAt.getTime() + remoteFunctionDryrunSandboxTimeoutMs);

        return {
            sandboxId: sandbox.sandboxId,
            startedAt,
            executionTimeoutAt,
            start: async () => {
                await sandbox.commands.run('node /tmp/nango-function-dryrun.mjs', {
                    cwd: remoteFunctionProjectPath,
                    background: true,
                    timeoutMs: 30_000,
                    envs: {
                        NO_COLOR: '1',
                        NANGO_SECRET_KEY: request.nango_secret_key,
                        NANGO_HOSTPORT: request.nango_host,
                        NANGO_DRYRUN_CALLBACK_URL: request.callback_url,
                        NANGO_DRYRUN_ARGS: JSON.stringify(buildDryrunArgs(request)),
                        NANGO_DRYRUN_COMPILE_TIMEOUT_MS: String(remoteFunctionCompileTimeoutMs),
                        NANGO_DRYRUN_TIMEOUT_MS: String(remoteFunctionDryrunTimeoutMs),
                        NANGO_DRYRUN_COMPILE_EXIT_CODE: String(NangoCliExitCode.CompileError)
                    }
                });
            },
            kill: async () => {
                await sandbox.kill().catch(() => undefined);
            }
        };
    } catch (err) {
        await sandbox.kill().catch(() => undefined);
        throw err;
    }
}

function prepareLocalAsyncDryrun(request: AsyncDryrunRequest): PreparedAsyncDryrun {
    const startedAt = new Date();
    const executionTimeoutAt = new Date(startedAt.getTime() + remoteFunctionDryrunSandboxTimeoutMs);

    return {
        sandboxId: 'local',
        startedAt,
        executionTimeoutAt,
        start: () => {
            void runLocalAsyncDryrun(request, startedAt).catch((err: unknown) => {
                logger.error(`Failed to complete local async dryrun callback: ${stringifyError(err)}`, { dryrunId: request.dryrun_id });
            });
            return Promise.resolve();
        },
        kill: () => Promise.resolve()
    };
}

async function runLocalAsyncDryrun(request: AsyncDryrunRequest, startedAt: Date): Promise<void> {
    try {
        const result = await invokeLocalDryrun(request);
        await postDryrunCallback(request, {
            status: 'success',
            output: result.output,
            duration_ms: Date.now() - startedAt.getTime()
        });
    } catch (err) {
        const error =
            err instanceof FunctionError
                ? { code: err.code, message: err.message, ...(err.payload !== undefined ? { payload: err.payload } : {}) }
                : { code: 'dryrun_error' as const, message: stringifyError(err) };

        await postDryrunCallback(request, {
            status: 'failed',
            duration_ms: Date.now() - startedAt.getTime(),
            error
        });
    }
}

async function postDryrunCallback(
    request: Pick<AsyncDryrunRequest, 'callback_url' | 'nango_secret_key'>,
    payload:
        | { status: 'success'; output: string; duration_ms?: number }
        | { status: 'failed'; output?: string; duration_ms?: number; error: { code?: string; message: string; payload?: unknown } }
): Promise<void> {
    const res = await fetch(request.callback_url, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${request.nango_secret_key}`,
            'content-type': 'application/json',
            'Nango-Is-Script': 'true'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        throw new Error(`Dry run callback failed with status ${res.status}`);
    }
}

export function buildAsyncDryrunScript(): string {
    return asyncDryrunScript;
}
