import { randomUUID } from 'node:crypto';

import { execDockerFileAsync, getExecErrorOutput, isExecTimeoutError, rewriteDockerHostForLocalhost, writeContainerFile } from './docker.js';
import { buildDryrunArgs } from '../remote-function/command-builders.js';
import { buildIndexTs, getFilePaths } from '../remote-function/compiler-client.js';
import { RemoteFunctionError } from '../remote-function/helpers.js';
import {
    remoteFunctionCompileTimeoutMs,
    remoteFunctionDryrunSandboxTimeoutMs,
    remoteFunctionDryrunTimeoutMs,
    remoteFunctionLocalImage,
    remoteFunctionProjectPath
} from '../remote-function/runtime.js';

import type { DryrunRequest, DryrunResult } from '../remote-function/dryrun-client.js';

export async function invokeLocalDryrun(request: DryrunRequest): Promise<DryrunResult> {
    const containerName = `nango-dryrun-${randomUUID().slice(0, 8)}`;
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
                '--add-host',
                'host.docker.internal:host-gateway',
                remoteFunctionLocalImage,
                'sleep',
                String(Math.ceil(remoteFunctionDryrunSandboxTimeoutMs / 1000))
            ],
            { timeout: 10_000 }
        );

        const { tsFilePath } = getFilePaths(request);

        await writeContainerFile(containerName, `${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await writeContainerFile(containerName, `${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));

        try {
            await execDockerFileAsync(['exec', '-w', remoteFunctionProjectPath, '-e', 'NO_COLOR=1', containerName, 'nango', 'compile'], {
                timeout: remoteFunctionCompileTimeoutMs
            });
        } catch (err) {
            throw new RemoteFunctionError({
                code: isExecTimeoutError(err) ? 'timeout' : 'compilation_error',
                message: isExecTimeoutError(err) ? 'Compilation timed out' : getExecErrorOutput(err),
                status: isExecTimeoutError(err) ? 504 : 400
            });
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
                ['exec', '-w', remoteFunctionProjectPath, containerName, 'nango', ...buildDryrunArgs(request)],
                { timeout: remoteFunctionDryrunTimeoutMs }
            );
            return { output: stdout || stderr };
        } catch (err) {
            throw new RemoteFunctionError({
                code: isExecTimeoutError(err) ? 'timeout' : 'dryrun_error',
                message: isExecTimeoutError(err) ? 'Dry run timed out' : getExecErrorOutput(err),
                status: isExecTimeoutError(err) ? 504 : 400
            });
        }
    } finally {
        await execDockerFileAsync(['rm', '-f', containerName]).catch(() => {});
    }
}
