import { CommandExitError, TimeoutError } from 'e2b';

import { isLocal, stringifyError } from '@nangohq/utils';

import { NangoCliExitCode, getDryrunErrorCode } from './cli-exit-codes.js';
import { buildDryrunArgs } from './command-builders.js';
import { getCommandOutput, getDryrunCommandSuccessOutput } from './command-output.js';
import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { RemoteFunctionError } from './helpers.js';
import { remoteFunctionCompileTimeoutMs, remoteFunctionDryrunSandboxTimeoutMs, remoteFunctionDryrunTimeoutMs, remoteFunctionProjectPath } from './runtime.js';
import { createRemoteFunctionSandbox } from './sandbox.js';
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

export async function invokeDryrun(request: DryrunRequest): Promise<DryrunResult> {
    if (isLocal) {
        return invokeLocalDryrun(request);
    }

    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B dryrun runtime');
    }

    const sandbox = await createRemoteFunctionSandbox({
        purpose: 'nango-dryrun',
        timeoutMs: remoteFunctionDryrunSandboxTimeoutMs,
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
                throw new RemoteFunctionError({ code: 'compilation_error', message: getCommandOutput(err, 'Compilation failed'), status: 400 });
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

            return { output: getDryrunCommandSuccessOutput({ stdout: result.stdout, stderr: result.stderr }) };
        } catch (err) {
            if (err instanceof CommandExitError) {
                throw new RemoteFunctionError({ code: getDryrunErrorCode(err), message: getCommandOutput(err, 'Dry run failed'), status: 400 });
            }
            if (err instanceof TimeoutError) {
                throw new RemoteFunctionError({ code: 'timeout', message: 'Dry run timed out', status: 504 });
            }
            throw err;
        }
    } finally {
        await sandbox.kill().catch(() => undefined);
    }
}

export async function prepareAsyncDryrun(request: AsyncDryrunRequest): Promise<PreparedAsyncDryrun> {
    if (isLocal) {
        return prepareLocalAsyncDryrun(request);
    }

    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B dryrun runtime');
    }

    const sandbox = await createRemoteFunctionSandbox({
        purpose: 'nango-function-dryrun',
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
            void runLocalAsyncDryrun(request, startedAt).catch(() => undefined);
            return Promise.resolve();
        },
        kill: () => Promise.resolve()
    };
}

async function runLocalAsyncDryrun(request: AsyncDryrunRequest, startedAt: Date): Promise<void> {
    try {
        const result = await invokeLocalDryrun(request);
        await postDryrunCallback(request, {
            status: 'succeeded',
            output: result.output,
            duration_ms: Date.now() - startedAt.getTime()
        });
    } catch (err) {
        const error =
            err instanceof RemoteFunctionError
                ? { code: err.code, message: err.message, ...(err.payload !== undefined ? { payload: err.payload } : {}) }
                : { code: 'dryrun_error' as const, message: stringifyError(err) };

        await postDryrunCallback(request, {
            status: 'failed',
            duration_ms: Date.now() - startedAt.getTime(),
            error
        }).catch(() => undefined);
    }
}

async function postDryrunCallback(
    request: Pick<AsyncDryrunRequest, 'callback_url' | 'nango_secret_key'>,
    payload:
        | { status: 'succeeded'; output: string; duration_ms?: number }
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
    return String.raw`
import { spawn } from 'node:child_process';

const startedAt = Date.now();
const callbackUrl = requiredEnv('NANGO_DRYRUN_CALLBACK_URL');
const token = requiredEnv('NANGO_SECRET_KEY');
const dryrunArgs = JSON.parse(requiredEnv('NANGO_DRYRUN_ARGS'));
const compileTimeoutMs = Number(requiredEnv('NANGO_DRYRUN_COMPILE_TIMEOUT_MS'));
const dryrunTimeoutMs = Number(requiredEnv('NANGO_DRYRUN_TIMEOUT_MS'));
const compileExitCode = Number(requiredEnv('NANGO_DRYRUN_COMPILE_EXIT_CODE'));

try {
    const compile = await runCommand('nango', ['compile'], { timeoutMs: compileTimeoutMs });
    if (compile.timedOut) {
        await postResult({ status: 'failed', output: commandOutput(compile), error: { code: 'timeout', message: 'Compilation timed out' } });
        process.exit(1);
    }
    if (compile.exitCode !== 0) {
        const output = commandOutput(compile);
        await postResult({ status: 'failed', output, error: { code: 'compilation_error', message: output || 'Compilation failed' } });
        process.exit(1);
    }

    const dryrun = await runCommand('nango', dryrunArgs, { timeoutMs: dryrunTimeoutMs });
    if (dryrun.timedOut) {
        await postResult({ status: 'failed', output: commandOutput(dryrun), error: { code: 'timeout', message: 'Dry run timed out' } });
        process.exit(1);
    }
    if (dryrun.exitCode !== 0) {
        const output = commandOutput(dryrun);
        await postResult({
            status: 'failed',
            output,
            error: {
                code: dryrun.exitCode === compileExitCode ? 'compilation_error' : 'dryrun_error',
                message: output || 'Dry run failed'
            }
        });
        process.exit(1);
    }

    await postResult({ status: 'succeeded', output: dryrun.stdout.trimEnd() });
    process.exit(0);
} catch (err) {
    await postResult({ status: 'failed', error: { code: 'dryrun_error', message: err instanceof Error ? err.message : String(err) } }).catch(() => undefined);
    process.exit(1);
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error('Missing ' + name);
    }
    return value;
}

function runCommand(command, args, { timeoutMs }) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (exitCode) => {
            clearTimeout(timer);
            resolve({ exitCode, stdout, stderr, timedOut });
        });
    });
}

async function postResult(payload) {
    const body = JSON.stringify({ ...payload, duration_ms: Date.now() - startedAt });
    let lastError;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const res = await fetch(callbackUrl, {
                method: 'POST',
                headers: {
                    authorization: 'Bearer ' + token,
                    'content-type': 'application/json',
                    'Nango-Is-Script': 'true'
                },
                body
            });
            if (res.ok) {
                return;
            }
            lastError = new Error('Callback failed with status ' + res.status);
        } catch (err) {
            lastError = err;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    throw lastError;
}

function commandOutput({ stdout, stderr }) {
    return [stdout, stderr]
        .map((value) => value.trimEnd())
        .filter((value, index, values) => value && values.indexOf(value) === index)
        .join('\n');
}
`.trimStart();
}
