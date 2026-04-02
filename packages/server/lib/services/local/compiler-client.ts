import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import { agentProjectPath } from '../agent/agent-runtime.js';
import { CompilerError, buildFlowConfig, buildIndexTs, getFilePaths } from '../remote-function/compiler-client.js';

import type { CompileRequest, CompileResult } from '../remote-function/compiler-client.js';

const execFileAsync = promisify(execFile);

const localCompilerImage = process.env['LOCAL_COMPILER_IMAGE'] || 'agent-sandboxes/blank-workspace:local';
const compilerTimeoutMs = 3 * 60 * 1000;

export async function invokeLocalCompiler(request: CompileRequest): Promise<CompileResult> {
    const containerName = `nango-compiler-${randomUUID().slice(0, 8)}`;

    try {
        await execFileAsync('docker', ['run', '-d', '--name', containerName, localCompilerImage, 'sleep', '300'], {
            timeout: 10_000
        });

        const { tsFilePath, cjsFilePath } = getFilePaths(request);

        await writeContainerFile(containerName, `${agentProjectPath}/${tsFilePath}`, request.code);
        await writeContainerFile(containerName, `${agentProjectPath}/index.ts`, buildIndexTs(request));

        try {
            await execFileAsync('docker', ['exec', '-w', agentProjectPath, '-e', 'NO_COLOR=1', containerName, 'nango', 'compile'], {
                timeout: compilerTimeoutMs
            });
        } catch (err) {
            throw new CompilerError(err instanceof Error ? err.message : String(err), 'compilation');
        }

        const [bundledJs, nangoJson] = await Promise.all([
            readContainerFile(containerName, `${agentProjectPath}/${cjsFilePath}`),
            readContainerFile(containerName, path.join(agentProjectPath, '.nango', 'nango.json'))
        ]);

        const flow = buildFlowConfig(nangoJson, request, bundledJs);
        return {
            bundledJs,
            bundleSizeBytes: Buffer.byteLength(bundledJs, 'utf8'),
            flow
        };
    } finally {
        await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
    }
}

async function writeContainerFile(containerName: string, filePath: string, content: string): Promise<void> {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    await execFileAsync('docker', ['exec', containerName, 'mkdir', '-p', dir]);

    await new Promise<void>((resolve, reject) => {
        const proc = spawn('docker', ['exec', '-i', containerName, 'bash', '-c', `cat > ${filePath}`]);
        proc.stdin.write(content);
        proc.stdin.end();
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`docker exec write exited with code ${code}`))));
        proc.on('error', reject);
    });
}

async function readContainerFile(containerName: string, filePath: string): Promise<string> {
    const { stdout } = await execFileAsync('docker', ['exec', containerName, 'cat', filePath]);
    return stdout;
}
