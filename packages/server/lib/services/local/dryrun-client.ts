import { randomUUID } from 'node:crypto';

import { execDockerFileAsync, getExecErrorOutput, rewriteDockerHostForLocalhost, writeContainerFile } from './docker.js';
import { buildDryrunArgs } from '../remote-function/command-builders.js';
import { buildIndexTs, getFilePaths } from '../remote-function/compiler-client.js';
import { remoteFunctionLocalImage, remoteFunctionProjectPath } from '../remote-function/runtime.js';

import type { DryrunRequest, DryrunResult } from '../remote-function/dryrun-client.js';

const compileTimeoutMs = 3 * 60 * 1000;
const dryrunTimeoutMs = 5 * 60 * 1000;

export async function invokeLocalDryrun(request: DryrunRequest): Promise<DryrunResult> {
    const containerName = `nango-dryrun-${randomUUID().slice(0, 8)}`;
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
            await execDockerFileAsync('docker', ['exec', '-w', remoteFunctionProjectPath, '-e', 'NO_COLOR=1', containerName, 'nango', 'compile'], {
                timeout: compileTimeoutMs
            });
        } catch (err) {
            return { output: getExecErrorOutput(err) };
        }

        if (request.input !== undefined) {
            await writeContainerFile(containerName, '/tmp/nango-dryrun-input.json', JSON.stringify(request.input));
        }
        if (request.metadata) {
            await writeContainerFile(containerName, '/tmp/nango-dryrun-metadata.json', JSON.stringify(request.metadata));
        }
        if (request.checkpoint) {
            await writeContainerFile(containerName, '/tmp/nango-dryrun-checkpoint.json', JSON.stringify(request.checkpoint));
        }

        try {
            const { stdout, stderr } = await execDockerFileAsync(
                'docker',
                ['exec', '-w', remoteFunctionProjectPath, containerName, 'nango', ...buildDryrunArgs(request)],
                { timeout: dryrunTimeoutMs }
            );
            return { output: stdout || stderr };
        } catch (err) {
            return { output: getExecErrorOutput(err) };
        }
    } finally {
        await execDockerFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
    }
}
