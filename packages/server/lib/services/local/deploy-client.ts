import { randomUUID } from 'node:crypto';

import { execDockerFileAsync, getExecErrorOutput, rewriteDockerHostForLocalhost, writeContainerFile } from './docker.js';
import { buildDeployArgs } from '../remote-function/command-builders.js';
import { buildIndexTs, getFilePaths } from '../remote-function/compiler-client.js';
import { remoteFunctionLocalImage, remoteFunctionProjectPath } from '../remote-function/runtime.js';

import type { DeployRequest, DeployResult } from '../remote-function/deploy-client.js';

const deployTimeoutMs = 5 * 60 * 1000;

export async function invokeLocalDeploy(request: DeployRequest): Promise<DeployResult> {
    const containerName = `nango-deploy-${randomUUID().slice(0, 8)}`;
    const nangoHost = rewriteDockerHostForLocalhost(request.nango_host);

    try {
        await execDockerFileAsync(
            'docker',
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
                '--add-host',
                'host.docker.internal:host-gateway',
                remoteFunctionLocalImage,
                'sleep',
                '300'
            ],
            { timeout: 10_000 }
        );

        const { tsFilePath } = getFilePaths(request);

        await writeContainerFile(containerName, `${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await writeContainerFile(containerName, `${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));

        try {
            const { stdout, stderr } = await execDockerFileAsync(
                'docker',
                ['exec', '-w', remoteFunctionProjectPath, containerName, 'nango', ...buildDeployArgs(request)],
                { timeout: deployTimeoutMs }
            );
            return { output: stdout || stderr };
        } catch (err) {
            return { output: getExecErrorOutput(err) };
        }
    } finally {
        await execDockerFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
    }
}
