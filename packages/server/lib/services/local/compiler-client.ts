import { randomUUID } from 'node:crypto';

import { execDockerFileAsync, getExecErrorOutput, readContainerFile, writeContainerFile } from './docker.js';
import { CompilerError, buildIndexTs, getFilePaths } from '../remote-function/compiler-client.js';
import { remoteFunctionLocalImage, remoteFunctionProjectPath } from '../remote-function/runtime.js';

import type { CompileRequest, CompileResult } from '../remote-function/compiler-client.js';

const compilerTimeoutMs = 3 * 60 * 1000;

export async function invokeLocalCompiler(request: CompileRequest): Promise<CompileResult> {
    const containerName = `nango-compiler-${randomUUID().slice(0, 8)}`;

    try {
        await execDockerFileAsync('docker', ['run', '-d', '--name', containerName, remoteFunctionLocalImage, 'sleep', '300'], { timeout: 10_000 });

        const { tsFilePath, cjsFilePath } = getFilePaths(request);

        await writeContainerFile(containerName, `${remoteFunctionProjectPath}/${tsFilePath}`, request.code);
        await writeContainerFile(containerName, `${remoteFunctionProjectPath}/index.ts`, buildIndexTs(request));

        try {
            await execDockerFileAsync('docker', ['exec', '-w', remoteFunctionProjectPath, '-e', 'NO_COLOR=1', containerName, 'nango', 'compile'], {
                timeout: compilerTimeoutMs
            });
        } catch (err) {
            throw new CompilerError(getExecErrorOutput(err), 'compilation');
        }

        const bundledJs = await readContainerFile(containerName, `${remoteFunctionProjectPath}/${cjsFilePath}`);

        return {
            bundledJs,
            bundleSizeBytes: Buffer.byteLength(bundledJs, 'utf8')
        };
    } finally {
        await execDockerFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
    }
}
