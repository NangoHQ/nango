import { readFileSync } from 'node:fs';

import { NangoCliExitCode, getDeployErrorCode } from './cli-exit-codes.js';
import { buildDeployArgs } from './command-builders.js';
import { getCommandOutput } from './command-output.js';
import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { FunctionError } from './helpers.js';
import { buildShellCommand } from './shell.js';
import { deploySandboxTimeoutMs, deployTimeoutMs } from './timeouts.js';
import { SandboxCommandExitError, SandboxCommandTimeoutError } from '../providers/errors.js';
import { sandboxService } from '../sandbox-service.js';

const asyncDeployScriptUrl = new URL('./async-deploy-script.js', import.meta.url);
const asyncDeployScript = readFileSync(asyncDeployScriptUrl, 'utf8');

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
    const sandbox = await sandboxService.create({
        purpose: 'deploy',
        timeoutMs: deploySandboxTimeoutMs,
        metadata: { deploymentId: request.deployment_id }
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.writeFiles([
            { path: tsFilePath, contents: request.code },
            { path: 'index.ts', contents: buildIndexTs(request) },
            { path: '/tmp/nango-function-deploy.mjs', contents: buildAsyncDeployScript() }
        ]);

        const startedAt = new Date();
        const executionTimeoutAt = new Date(startedAt.getTime() + deploySandboxTimeoutMs);

        return {
            sandboxId: sandbox.id,
            startedAt,
            executionTimeoutAt,
            start: async () => {
                await sandbox.startCommand({
                    command: 'node /tmp/nango-function-deploy.mjs',
                    timeoutMs: 0,
                    envs: {
                        NO_COLOR: '1',
                        NANGO_SECRET_KEY: request.nango_secret_key,
                        NANGO_HOSTPORT: request.nango_host,
                        NANGO_DEPLOY_AUTO_CONFIRM: 'true',
                        NANGO_DEPLOY_SOURCE: 'standalone',
                        NANGO_DEPLOY_CALLBACK_URL: request.callback_url,
                        NANGO_DEPLOY_ARGS: JSON.stringify(buildDeployArgs(request)),
                        NANGO_DEPLOY_TIMEOUT_MS: String(deployTimeoutMs),
                        NANGO_DEPLOY_COMPILE_EXIT_CODE: String(NangoCliExitCode.CompileError)
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

export async function invokeDeploy(request: DeployRequest): Promise<DeployResult> {
    const sandbox = await sandboxService.create({
        purpose: 'deploy',
        timeoutMs: deploySandboxTimeoutMs
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.writeFiles([
            { path: tsFilePath, contents: request.code },
            { path: 'index.ts', contents: buildIndexTs(request) }
        ]);

        const commandEnvs = {
            NO_COLOR: '1',
            NANGO_SECRET_KEY: request.nango_secret_key,
            NANGO_HOSTPORT: request.nango_host,
            NANGO_DEPLOY_AUTO_CONFIRM: 'true',
            NANGO_DEPLOY_SOURCE: 'standalone'
        };
        const command = buildShellCommand(['nango', ...buildDeployArgs(request)]);

        try {
            const result = await sandbox.runCommand({
                command,
                timeoutMs: deployTimeoutMs,
                envs: commandEnvs
            });
            return { output: result.stdout };
        } catch (err) {
            if (err instanceof SandboxCommandExitError) {
                const output = getCommandOutput(err, 'Deployment failed');
                throw new FunctionError({
                    code: getDeployErrorCode(err),
                    message: output,
                    status: 400
                });
            }
            if (err instanceof SandboxCommandTimeoutError) {
                throw new FunctionError({ code: 'timeout', message: 'Deployment timed out', status: 504 });
            }
            throw err;
        }
    } finally {
        await sandbox.stop().catch(() => undefined);
    }
}

export function buildAsyncDeployScript(): string {
    return asyncDeployScript;
}
