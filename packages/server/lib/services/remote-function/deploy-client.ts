import { randomUUID } from 'node:crypto';

import { CommandExitError, Sandbox, TimeoutError } from 'e2b';

import { isLocal } from '@nangohq/utils';

import { buildDeployArgs } from './command-builders.js';
import { getCommandOutput, isCompilationFailureOutput } from './command-output.js';
import { buildIndexTs, getFilePaths } from './compiler-client.js';
import { RemoteFunctionError } from './helpers.js';
import { remoteFunctionCompilerTemplate, remoteFunctionDeploySandboxTimeoutMs, remoteFunctionDeployTimeoutMs, remoteFunctionProjectPath } from './runtime.js';
import { buildShellCommand } from './shell.js';
import { invokeLocalDeploy } from '../local/deploy-client.js';

export interface DeployRequest {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
    code: string;
    environment_name: string;
    nango_secret_key: string;
    nango_host: string;
}

export interface DeployResult {
    output: string;
}

export async function invokeDeploy(request: DeployRequest): Promise<DeployResult> {
    if (isLocal) {
        return invokeLocalDeploy(request);
    }

    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B deploy runtime');
    }

    const sandbox = await Sandbox.create(remoteFunctionCompilerTemplate, {
        timeoutMs: remoteFunctionDeploySandboxTimeoutMs,
        allowInternetAccess: true,
        metadata: { purpose: 'nango-deploy', requestId: randomUUID() },
        network: { allowPublicTraffic: true },
        apiKey
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.files.write(`${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await sandbox.files.write(`${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));

        const envs = {
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
                envs
            });
            return { output: result.stdout };
        } catch (err) {
            if (err instanceof CommandExitError) {
                const output = getCommandOutput(err, 'Deployment failed');
                throw new RemoteFunctionError({
                    code: isCompilationFailureOutput(output) ? 'compilation_error' : 'deployment_error',
                    message: output,
                    status: 400
                });
            }
            if (err instanceof TimeoutError) {
                throw new RemoteFunctionError({ code: 'timeout', message: 'Deployment timed out', status: 504 });
            }
            throw err;
        }
    } finally {
        await sandbox.kill().catch(() => undefined);
    }
}
