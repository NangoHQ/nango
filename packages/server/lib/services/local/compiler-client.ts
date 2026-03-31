import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { e2bCompilerHarness } from '../sf/compiler-client.e2b.harness.js';
import { SfCompilerError } from '../sf/compiler-client.js';

import type { CompileResult, SfCompileRequest } from '../sf/compiler-client.js';

const execFileAsync = promisify(execFile);

const compilerRequestPath = '/tmp/nango-sf-compile-request.json';
const compilerHarnessPath = '/tmp/nango-sf-compile.mjs';
const compilerProjectPath = '/home/user/nango-integrations';
const localCompilerImageName = process.env['LOCAL_COMPILER_IMAGE'] || 'nango-local-compiler';

type CompileResponse =
    | { success: true; bundledJs: string; flow: CompileResult['flow'] }
    | { success: false; step: 'validation' | 'compilation'; message: string; stack?: string };

export async function invokeLocalCompiler(request: SfCompileRequest): Promise<CompileResult> {
    const containerName = `nango-compiler-${randomUUID().slice(0, 8)}`;

    await execFileAsync('docker', ['run', '-d', '--name', containerName, localCompilerImageName]);

    try {
        await writeFileToContainer(containerName, compilerRequestPath, JSON.stringify(request));
        await writeFileToContainer(containerName, compilerHarnessPath, e2bCompilerHarness);

        try {
            const { stdout } = await execFileAsync('docker', [
                'exec', '-w', compilerProjectPath,
                containerName,
                'node', compilerHarnessPath, compilerRequestPath
            ]);

            const parsed = parseCompileResponse(stdout);
            if (!parsed.success) {
                throw new SfCompilerError(parsed.message, parsed.step, parsed.stack);
            }
            return { bundledJs: parsed.bundledJs, flow: parsed.flow };
        } catch (error) {
            if (error instanceof SfCompilerError) {
                throw error;
            }
            // execFileAsync throws on non-zero exit but stdout still holds the JSON response
            if (error && typeof error === 'object' && ('stdout' in error || 'stderr' in error)) {
                const raw = String((error as Record<string, unknown>)['stdout'] || (error as Record<string, unknown>)['stderr'] || '');
                const parsed = parseCompileResponse(raw);
                if (!parsed.success) {
                    throw new SfCompilerError(parsed.message, parsed.step, parsed.stack);
                }
            }
            throw error;
        }
    } finally {
        await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => {});
    }
}

async function writeFileToContainer(containerName: string, filePath: string, content: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const proc = spawn('docker', ['exec', '-i', containerName, 'bash', '-c', `cat > ${filePath}`]);
        proc.stdin.write(content);
        proc.stdin.end();
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`docker exec write exited with code ${code}`))));
        proc.on('error', reject);
    });
}

function parseCompileResponse(raw: string): CompileResponse {
    if (!raw) {
        throw new Error('Local compiler returned an empty response');
    }
    try {
        return JSON.parse(raw.trim()) as CompileResponse;
    } catch (error) {
        throw new Error(`Failed to parse local compiler response: ${error instanceof Error ? error.message : String(error)}\n${raw}`);
    }
}
