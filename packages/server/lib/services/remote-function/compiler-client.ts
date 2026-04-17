import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { CommandExitError, Sandbox, TimeoutError } from 'e2b';

import { isLocal } from '@nangohq/utils';

import { RemoteFunctionError } from './helpers.js';
import {
    remoteFunctionCompileTimeoutMs,
    remoteFunctionCompilerSandboxTimeoutMs,
    remoteFunctionCompilerTemplate,
    remoteFunctionProjectPath
} from './runtime.js';
import { invokeLocalCompiler } from '../local/compiler-client.js';

export interface CompileRequest {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
    code: string;
}

export interface CompileResult {
    bundledJs: string;
    bundleSizeBytes: number;
}

export class CompilerError extends RemoteFunctionError {
    public readonly step: 'validation' | 'compilation';

    constructor(message: string, step: 'validation' | 'compilation', remoteStack?: string) {
        super({ code: step === 'validation' ? 'validation_error' : 'compilation_error', message, status: 400 });
        this.name = 'CompilerError';
        this.step = step;
        if (remoteStack !== undefined) {
            this.stack = remoteStack;
        }
    }
}

export async function invokeCompiler(request: CompileRequest): Promise<CompileResult> {
    if (isLocal) {
        return invokeLocalCompiler(request);
    }

    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B compiler runtime');
    }

    const sandbox = await Sandbox.create(remoteFunctionCompilerTemplate, {
        timeoutMs: remoteFunctionCompilerSandboxTimeoutMs,
        allowInternetAccess: true,
        metadata: { purpose: 'nango-compiler', requestId: randomUUID() },
        network: { allowPublicTraffic: true },
        apiKey
    });

    try {
        const { tsFilePath, cjsFilePath } = getFilePaths(request);

        await sandbox.files.write(path.join(remoteFunctionProjectPath, tsFilePath), request.code);
        await sandbox.files.write(path.join(remoteFunctionProjectPath, 'index.ts'), buildIndexTs(request));

        try {
            await sandbox.commands.run('nango compile', {
                cwd: remoteFunctionProjectPath,
                timeoutMs: remoteFunctionCompileTimeoutMs,
                envs: { NO_COLOR: '1' }
            });
        } catch (err) {
            if (err instanceof CommandExitError) {
                throw new CompilerError(err.stderr || err.stdout || 'Compilation failed', 'compilation');
            }
            if (err instanceof TimeoutError) {
                throw new RemoteFunctionError({ code: 'timeout', message: 'Compilation timed out', status: 504 });
            }
            throw err;
        }

        const bundledJs = String(await sandbox.files.read(path.join(remoteFunctionProjectPath, cjsFilePath)));

        return {
            bundledJs,
            bundleSizeBytes: Buffer.byteLength(bundledJs, 'utf8')
        };
    } finally {
        await sandbox.kill().catch(() => {});
    }
}

export function getFilePaths(request: Pick<CompileRequest, 'integration_id' | 'function_name' | 'function_type'>): {
    tsFilePath: string;
    cjsFilePath: string;
} {
    const folder = request.function_type === 'action' ? 'actions' : 'syncs';
    const tsFilePath = `${request.integration_id}/${folder}/${request.function_name}.ts`;
    const cjsFilePath = `build/${request.integration_id}_${folder}_${request.function_name}.cjs`;
    return { tsFilePath, cjsFilePath };
}

export function buildIndexTs(request: Pick<CompileRequest, 'integration_id' | 'function_name' | 'function_type'>): string {
    const folder = request.function_type === 'action' ? 'actions' : 'syncs';
    return `import './${request.integration_id}/${folder}/${request.function_name}.js';\n`;
}
