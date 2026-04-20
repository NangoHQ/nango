import { randomUUID } from 'node:crypto';

import { execDockerFileAsync, getExecErrorOutput, isExecTimeoutError, rewriteDockerHostForLocalhost, writeContainerFile } from './docker.js';
import { buildDeployArgs } from '../remote-function/command-builders.js';
import { isCompilationFailureOutput } from '../remote-function/command-output.js';
import { buildIndexTs, getFilePaths } from '../remote-function/compiler-client.js';
import { RemoteFunctionError } from '../remote-function/helpers.js';
import {
    remoteFunctionDeploySandboxTimeoutMs,
    remoteFunctionDeployTimeoutMs,
    remoteFunctionLocalImage,
    remoteFunctionProjectPath
} from '../remote-function/runtime.js';

import type { DeployRequest, DeployResult } from '../remote-function/deploy-client.js';

export async function invokeLocalDeploy(request: DeployRequest): Promise<DeployResult> {
    const containerName = `nango-deploy-${randomUUID().slice(0, 8)}`;
    const nangoHost = rewriteDockerHostForLocalhost(request.nango_host);

    try {
        await execDockerFileAsync(
            [
                'run',
                '-d',
                '--name',
                containerName,
                '-e',
                `NANGO_SECRET_KEY=${request.nango_secret_key}`,
                '-e',
                `NANGO_HOSTPORT=${nangoHost}`,
                '-e',
                'NO_COLOR=1',
                '-e',
                'NANGO_DEPLOY_AUTO_CONFIRM=true',
                '-e',
                'NANGO_DEPLOY_SOURCE=standalone',
                '--add-host',
                'host.docker.internal:host-gateway',
                remoteFunctionLocalImage,
                'sleep',
                String(Math.ceil(remoteFunctionDeploySandboxTimeoutMs / 1000))
            ],
            { timeout: 10_000 }
        );

        const { tsFilePath } = getFilePaths(request);

        await writeContainerFile(containerName, `${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await writeContainerFile(containerName, `${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));

        try {
            const { stdout, stderr } = await execDockerFileAsync(
                ['exec', '-w', remoteFunctionProjectPath, containerName, 'nango', ...buildDeployArgs(request)],
                { timeout: remoteFunctionDeployTimeoutMs }
            );
            return { output: stdout || stderr };
        } catch (err) {
            const output = getExecErrorOutput(err);
            throw new RemoteFunctionError({
                code: isExecTimeoutError(err) ? 'timeout' : isCompilationFailureOutput(output) ? 'compilation_error' : 'deployment_error',
                message: isExecTimeoutError(err) ? 'Deployment timed out' : output,
                status: isExecTimeoutError(err) ? 504 : 400
            });
        }
    } finally {
        await execDockerFileAsync(['rm', '-f', containerName]).catch(() => undefined);
    }
}
