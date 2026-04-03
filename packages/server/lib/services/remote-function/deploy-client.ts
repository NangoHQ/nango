import { randomUUID } from 'node:crypto';

import { CommandExitError, Sandbox } from 'e2b';

import { isLocal } from '@nangohq/utils';

import { buildIndexTs, buildNangoYaml, getFilePaths } from './compiler-client.js';
import { agentProjectPath } from '../agent/agent-runtime.js';
import { invokeLocalDeploy } from '../local/deploy-client.js';

export interface DeployRequest {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
    code: string;
    nango_secret_key: string;
    nango_host: string;
}

export interface DeployResult {
    output: string;
}

const deployTimeoutMs = 5 * 60 * 1000;

export async function invokeDeploy(request: DeployRequest): Promise<DeployResult> {
    if (isLocal) {
        return invokeLocalDeploy(request);
    }

    if (!process.env['SANDBOX_API_KEY']) {
        throw new Error('SANDBOX_API_KEY is required for the E2B deploy runtime');
    }

    const sandbox = await Sandbox.create(process.env['SANDBOX_COMPILER_TEMPLATE'] || 'nango-sf-compiler', {
        timeoutMs: deployTimeoutMs,
        allowInternetAccess: true,
        metadata: { purpose: 'nango-deploy', requestId: randomUUID() },
        network: { allowPublicTraffic: true }
    });

    try {
        const { tsFilePath } = getFilePaths(request);

        await sandbox.files.write(`${agentProjectPath}/${tsFilePath}`, request.code);
        await sandbox.files.write(`${agentProjectPath}/index.ts`, buildIndexTs(request));
        await sandbox.files.write(`${agentProjectPath}/nango.yaml`, buildNangoYaml(request));

        const cmd = buildDeployCommand(request);
        const envs = {
            NO_COLOR: '1',
            NANGO_SECRET_KEY: request.nango_secret_key,
            NANGO_HOSTPORT: request.nango_host,
            NANGO_DEPLOY_AUTO_CONFIRM: 'true'
        };

        let output: string;
        try {
            const result = await sandbox.commands.run(cmd, {
                cwd: agentProjectPath,
                timeoutMs: deployTimeoutMs,
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

function buildDeployCommand(request: DeployRequest): string {
    const typeFlag = request.function_type === 'action' ? `--action ${request.function_name}` : `--sync ${request.function_name}`;
    return `nango deploy ${typeFlag} --auto-confirm --allow-destructive`;
}
