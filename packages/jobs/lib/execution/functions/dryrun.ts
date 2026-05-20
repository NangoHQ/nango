import { randomUUID } from 'node:crypto';

import { Sandbox } from 'e2b';
import { z } from 'zod';

import db from '@nangohq/database';
import {
    customerKeyService,
    environmentService,
    getApiUrl,
    getFunctionDryrunRow,
    internalFunctionDryrunActionName,
    markFunctionDryrunFailed,
    markFunctionDryrunRunning
} from '@nangohq/shared';
import { Err, Ok, stringifyError } from '@nangohq/utils';

import { envs } from '../../env.js';

import type { TaskAction } from '@nangohq/nango-orchestrator';
import type { FunctionDryrunError, FunctionDryrunStoredRequest } from '@nangohq/shared';
import type { Result } from '@nangohq/utils';

const projectPath = '/home/user/nango-integrations';
const compileTimeoutMs = 3 * 60 * 1000;
const dryrunTimeoutMs = 5 * 60 * 1000;
const sandboxTimeoutBufferMs = 30 * 1000;
const sandboxTokenTimeoutBufferMs = 60 * 1000;
const dryrunSandboxTimeoutMs = compileTimeoutMs + dryrunTimeoutMs + sandboxTimeoutBufferMs;

const internalDryrunInputSchema = z
    .object({
        dryrunId: z.string().uuid(),
        parentCustomerKeyId: z.number().int().positive()
    })
    .strict();

export function isInternalFunctionDryrunAction(task: TaskAction): boolean {
    return task.actionName === internalFunctionDryrunActionName;
}

export async function startInternalFunctionDryrun(task: TaskAction): Promise<Result<void>> {
    const input = internalDryrunInputSchema.safeParse(task.input);
    if (!input.success) {
        return Err(`Invalid internal function dryrun input: ${input.error.message}`);
    }

    const environmentId = task.connection.environment_id;
    const dryrun = await getFunctionDryrunRow({ environmentId, id: input.data.dryrunId });
    if (!dryrun) {
        return Err(`Function dryrun '${input.data.dryrunId}' was not found`);
    }

    if (dryrun.status !== 'pending') {
        return Ok(undefined);
    }

    const fail = async (error: FunctionDryrunError): Promise<Result<void>> => {
        await markFunctionDryrunFailed({
            environmentId,
            id: dryrun.id,
            error,
            statuses: ['pending']
        });
        return Err(error.message);
    };

    const environment = await environmentService.getById(environmentId);
    if (!environment) {
        return fail({ code: 'dryrun_error', message: `Environment '${environmentId}' was not found` });
    }

    const sandboxApiKey = await customerKeyService.createSandboxApiKey(db.knex, {
        parentApiKeyId: input.data.parentCustomerKeyId,
        environmentId,
        expiresAt: new Date(Date.now() + dryrunSandboxTimeoutMs + sandboxTokenTimeoutBufferMs)
    });
    if (sandboxApiKey.isErr()) {
        return fail({ code: 'dryrun_error', message: stringifyError(sandboxApiKey.error) });
    }

    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        return fail({ code: 'dryrun_error', message: 'E2B_API_KEY is required for the E2B dryrun runtime' });
    }

    let sandbox: Sandbox | undefined;
    try {
        sandbox = await Sandbox.create(envs.E2B_SANDBOX_COMPILER_TEMPLATE, {
            timeoutMs: dryrunSandboxTimeoutMs,
            allowInternetAccess: true,
            metadata: { purpose: 'nango-function-dryrun', dryrunId: dryrun.id, requestId: randomUUID() },
            network: { allowPublicTraffic: true },
            apiKey
        });

        const request = dryrun.request;
        const { tsFilePath } = getFilePaths(request);

        await sandbox.files.write(`${projectPath}/${tsFilePath}`, request.code);
        await sandbox.files.write(`${projectPath}/index.ts`, buildIndexTs(request));

        if (request.input !== undefined) {
            await sandbox.files.write('/tmp/nango-dryrun-input.json', JSON.stringify(request.input));
        }
        if (request.metadata) {
            await sandbox.files.write('/tmp/nango-dryrun-metadata.json', JSON.stringify(request.metadata));
        }
        if (request.checkpoint) {
            await sandbox.files.write('/tmp/nango-dryrun-checkpoint.json', JSON.stringify(request.checkpoint));
        }

        await sandbox.files.write('/tmp/nango-function-dryrun.mjs', buildDryrunScript());

        const startedAt = new Date();
        await sandbox.commands.run('node /tmp/nango-function-dryrun.mjs', {
            cwd: projectPath,
            background: true,
            timeoutMs: 30_000,
            envs: {
                NO_COLOR: '1',
                NANGO_SECRET_KEY: sandboxApiKey.value,
                NANGO_HOSTPORT: getApiUrl(),
                NANGO_DRYRUN_CALLBACK_URL: `${getApiUrl()}/functions/dryruns/${dryrun.id}/result`,
                NANGO_DRYRUN_ARGS: JSON.stringify(buildDryrunArgs(request, environment.name)),
                NANGO_DRYRUN_COMPILE_TIMEOUT_MS: String(compileTimeoutMs),
                NANGO_DRYRUN_TIMEOUT_MS: String(dryrunTimeoutMs)
            }
        });

        const marked = await markFunctionDryrunRunning({
            environmentId,
            id: dryrun.id,
            sandboxId: sandbox.sandboxId,
            startedAt,
            executionTimeoutAt: new Date(startedAt.getTime() + dryrunSandboxTimeoutMs)
        });

        if (!marked) {
            await sandbox.kill().catch(() => undefined);
            return Ok(undefined);
        }

        return Ok(undefined);
    } catch (err) {
        await sandbox?.kill().catch(() => undefined);
        return fail({ code: 'dryrun_error', message: stringifyError(err) });
    }
}

function getFilePaths(request: Pick<FunctionDryrunStoredRequest, 'integration_id' | 'function_name' | 'function_type'>): { tsFilePath: string } {
    const folder = request.function_type === 'action' ? 'actions' : 'syncs';
    return { tsFilePath: `${request.integration_id}/${folder}/${request.function_name}.ts` };
}

function buildIndexTs(request: Pick<FunctionDryrunStoredRequest, 'integration_id' | 'function_name' | 'function_type'>): string {
    const folder = request.function_type === 'action' ? 'actions' : 'syncs';
    return `import './${request.integration_id}/${folder}/${request.function_name}.js';\n`;
}

function buildDryrunArgs(request: FunctionDryrunStoredRequest, environmentName: string): string[] {
    const args = [
        'dryrun',
        request.function_name,
        request.connection_id,
        '--environment',
        environmentName,
        '--integration-id',
        request.integration_id,
        '--auto-confirm',
        '--no-interactive'
    ];

    if (request.input !== undefined) {
        args.push('--input', '@/tmp/nango-dryrun-input.json');
    }
    if (request.metadata) {
        args.push('--metadata', '@/tmp/nango-dryrun-metadata.json');
    }
    if (request.checkpoint) {
        args.push('--checkpoint', '@/tmp/nango-dryrun-checkpoint.json');
    }
    if (request.last_sync_date) {
        args.push('--lastSyncDate', request.last_sync_date);
    }

    return args;
}

function buildDryrunScript(): string {
    return String.raw`
import { spawn } from 'node:child_process';

const startedAt = Date.now();
const callbackUrl = requiredEnv('NANGO_DRYRUN_CALLBACK_URL');
const token = requiredEnv('NANGO_SECRET_KEY');
const dryrunArgs = JSON.parse(requiredEnv('NANGO_DRYRUN_ARGS'));
const compileTimeoutMs = Number(requiredEnv('NANGO_DRYRUN_COMPILE_TIMEOUT_MS'));
const dryrunTimeoutMs = Number(requiredEnv('NANGO_DRYRUN_TIMEOUT_MS'));

try {
    const compile = await runCommand('nango', ['compile'], { timeoutMs: compileTimeoutMs });
    if (compile.timedOut) {
        await postResult({ status: 'failed', error: { code: 'timeout', message: 'Compilation timed out' } });
        process.exit(1);
    }
    if (compile.exitCode !== 0) {
        await postResult({ status: 'failed', output: commandOutput(compile), error: { code: 'compilation_error', message: commandOutput(compile) || 'Compilation failed' } });
        process.exit(1);
    }

    const dryrun = await runCommand('nango', dryrunArgs, { timeoutMs: dryrunTimeoutMs });
    if (dryrun.timedOut) {
        await postResult({ status: 'failed', output: commandOutput(dryrun), error: { code: 'timeout', message: 'Dry run timed out' } });
        process.exit(1);
    }
    if (dryrun.exitCode !== 0) {
        await postResult({ status: 'failed', output: commandOutput(dryrun), error: { code: 'dryrun_error', message: commandOutput(dryrun) || 'Dry run failed' } });
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
                    'content-type': 'application/json'
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
