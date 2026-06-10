import { readFileSync } from 'node:fs';

import { CommandExitError, TimeoutError } from 'e2b';

import { getLogger, isLocal, stringifyError } from '@nangohq/utils';

import { NangoCliExitCode, getDeployErrorCode } from './cli-exit-codes.js';
import { buildDeployArgs } from './command-builders.js';
import { getCommandOutput } from './command-output.js';
import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { FunctionError } from './helpers.js';
import { remoteFunctionDeploySandboxTimeoutMs, remoteFunctionDeployTimeoutMs, remoteFunctionProjectPath } from './runtime.js';
import { createFunctionSandbox } from './sandbox.js';
import { buildShellCommand } from './shell.js';
import { envs } from '../env.js';
import { invokeLocalDeploy } from '../local/deploy-client.js';

const asyncDeployScriptUrl = new URL('./async-deploy-script.js', import.meta.url);
const asyncDeployScript = readFileSync(asyncDeployScriptUrl, 'utf8');
const logger = getLogger('FunctionDeploy');

export interface DeployRequest {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
    code: string;
    environment_name: string;
    nango_secret_key: string;
    nango_host: string;
    version?: string;
    allow_destructive?: boolean;
}

export interface DeployResult {
    output: string;
}

export interface AsyncDeployRequest extends DeployRequest {
    deployment_id: string;
    callback_url: string;
}

export interface PreparedAsyncDeploy {
    sandboxId: string;
    startedAt: Date;
    executionTimeoutAt: Date;
    start: () => Promise<void>;
    kill: () => Promise<void>;
}

export async function prepareAsyncDeploy(request: AsyncDeployRequest): Promise<PreparedAsyncDeploy> {
    if (isLocal) {
        return prepareLocalAsyncDeploy(request);
    }

    const apiKey = envs.E2B_API_KEY;
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B deploy runtime');
    }

    const sandbox = await createFunctionSandbox({
        purpose: 'deploy',
        timeoutMs: remoteFunctionDeploySandboxTimeoutMs,
        metadata: { deploymentId: request.deployment_id },
        apiKey
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.files.write(`${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await sandbox.files.write(`${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));
        await sandbox.files.write('/tmp/nango-function-deploy.mjs', buildAsyncDeployScript());

        const startedAt = new Date();
        const executionTimeoutAt = new Date(startedAt.getTime() + remoteFunctionDeploySandboxTimeoutMs);

        return {
            sandboxId: sandbox.sandboxId,
            startedAt,
            executionTimeoutAt,
            start: async () => {
                await sandbox.commands.run('node /tmp/nango-function-deploy.mjs', {
                    cwd: remoteFunctionProjectPath,
                    background: true,
                    timeoutMs: 0,
                    envs: {
                        NO_COLOR: '1',
                        NANGO_SECRET_KEY: request.nango_secret_key,
                        NANGO_HOSTPORT: request.nango_host,
                        NANGO_DEPLOY_AUTO_CONFIRM: 'true',
                        NANGO_DEPLOY_SOURCE: 'standalone',
                        NANGO_DEPLOY_CALLBACK_URL: request.callback_url,
                        NANGO_DEPLOY_ARGS: JSON.stringify(buildDeployArgs(request)),
                        NANGO_DEPLOY_TIMEOUT_MS: String(remoteFunctionDeployTimeoutMs),
                        NANGO_DEPLOY_COMPILE_EXIT_CODE: String(NangoCliExitCode.CompileError)
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

export async function invokeDeploy(request: DeployRequest): Promise<DeployResult> {
    if (isLocal) {
        return invokeLocalDeploy(request);
    }

    const apiKey = envs.E2B_API_KEY;
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B deploy runtime');
    }

    const sandbox = await createFunctionSandbox({
        purpose: 'deploy',
        timeoutMs: remoteFunctionDeploySandboxTimeoutMs,
        apiKey
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.files.write(`${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await sandbox.files.write(`${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));

        const commandEnvs = {
            NO_COLOR: '1',
            NANGO_SECRET_KEY: request.nango_secret_key,
            NANGO_HOSTPORT: request.nango_host,
            NANGO_DEPLOY_AUTO_CONFIRM: 'true',
            NANGO_DEPLOY_SOURCE: 'standalone'
        };
        const command = buildShellCommand(['nango', ...buildDeployArgs(request)]);

        try {
            const result = await sandbox.commands.run(command, {
                cwd: remoteFunctionProjectPath,
                timeoutMs: remoteFunctionDeployTimeoutMs,
                envs: commandEnvs
            });
            return { output: result.stdout };
        } catch (err) {
            if (err instanceof CommandExitError) {
                const output = getCommandOutput(err, 'Deployment failed');
                throw new FunctionError({
                    code: getDeployErrorCode(err),
                    message: output,
                    status: 400
                });
            }
            if (err instanceof TimeoutError) {
                throw new FunctionError({ code: 'timeout', message: 'Deployment timed out', status: 504 });
            }
            throw err;
        }
    } finally {
        await sandbox.kill().catch(() => undefined);
    }
}

function prepareLocalAsyncDeploy(request: AsyncDeployRequest): PreparedAsyncDeploy {
    const startedAt = new Date();
    const executionTimeoutAt = new Date(startedAt.getTime() + remoteFunctionDeploySandboxTimeoutMs);

    return {
        sandboxId: 'local',
        startedAt,
        executionTimeoutAt,
        start: () => {
            void runLocalAsyncDeploy(request, startedAt).catch((err: unknown) => {
                logger.error(`Failed to complete local async deployment callback: ${stringifyError(err)}`, { deploymentId: request.deployment_id });
            });
            return Promise.resolve();
        },
        kill: () => Promise.resolve()
    };
}

async function runLocalAsyncDeploy(request: AsyncDeployRequest, startedAt: Date): Promise<void> {
    try {
        const result = await invokeLocalDeploy(request);
        await postDeployCallback(request, {
            status: 'success',
            output: result.output,
            duration_ms: Date.now() - startedAt.getTime()
        });
    } catch (err) {
        const error =
            err instanceof FunctionError
                ? { code: err.code, message: err.message, ...(err.payload !== undefined ? { payload: err.payload } : {}) }
                : { code: 'deployment_error' as const, message: stringifyError(err) };

        await postDeployCallback(request, {
            status: 'failed',
            duration_ms: Date.now() - startedAt.getTime(),
            error
        });
    }
}

async function postDeployCallback(
    request: Pick<AsyncDeployRequest, 'callback_url' | 'nango_secret_key'>,
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
        throw new Error(`Deployment callback failed with status ${res.status}`);
    }
}

export function buildAsyncDeployScript(): string {
    return asyncDeployScript;
}
