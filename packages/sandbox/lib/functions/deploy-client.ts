import { readFileSync } from 'node:fs';

import { NangoCliExitCode } from './cli-exit-codes.js';
import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { createFunctionSandbox } from './sandbox.js';
import { deploySandboxTimeoutMs, deployTimeoutMs } from './timeouts.js';

const asyncDeployScriptUrl = new URL('./async-deploy-script.js', import.meta.url);
const asyncDeployScript = readFileSync(asyncDeployScriptUrl, 'utf8');
// This workspace-relative file is written through sandbox.writeFiles before
// the background deploy command starts.
const asyncDeployScriptPath = '.nango/runtime/nango-function-deploy.mjs';

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
    const sandbox = await createFunctionSandbox({
        purpose: 'deploy',
        timeoutMs: deploySandboxTimeoutMs,
        metadata: { deploymentId: request.deployment_id }
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.writeFiles([
            { path: tsFilePath, contents: request.code },
            { path: 'index.ts', contents: buildIndexTs(request) },
            { path: asyncDeployScriptPath, contents: buildAsyncDeployScript() }
        ]);

        const startedAt = new Date();
        const executionTimeoutAt = new Date(startedAt.getTime() + deploySandboxTimeoutMs);

        return {
            sandboxId: sandbox.id,
            startedAt,
            executionTimeoutAt,
            start: async () => {
                await sandbox.startCommand({
                    command: `node ${asyncDeployScriptPath}`,
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

export function buildAsyncDeployScript(): string {
    return asyncDeployScript;
}

function buildDeployArgs(request: DeployRequest): string[] {
    const args = [
        'deploy',
        request.environment_name,
        '--integration',
        request.integration_id,
        request.function_type === 'action' ? '--action' : '--sync',
        request.function_name,
        '--auto-confirm',
        '--no-interactive'
    ];

    if (request.version) {
        args.push('--version', request.version);
    }
    if (request.allow_destructive) {
        args.push('--allow-destructive');
    }

    return args;
}
