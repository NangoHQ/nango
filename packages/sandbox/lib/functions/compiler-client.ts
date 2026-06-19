import { getCommandOutput } from './command-output.js';
import { FunctionError } from './helpers.js';
import { createFunctionSandbox } from './sandbox.js';
import { compileSandboxTimeoutMs, compileTimeoutMs } from './timeouts.js';
import { SandboxCommandExitError, SandboxCommandTimeoutError } from '../providers/errors.js';

interface FunctionFilePathRequest {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
}

export interface CompileRequest {
    code: string;
}

export interface CompileResult {
    bundledJs: string;
    bundleSizeBytes: number;
}

export class CompilerError extends FunctionError {
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
    const sandbox = await createFunctionSandbox({
        purpose: 'compile',
        timeoutMs: compileSandboxTimeoutMs
    });

    try {
        const { tsFilePath, cjsFilePath } = getCompilerFilePaths();

        await sandbox.writeFiles([
            { path: tsFilePath, contents: request.code },
            { path: 'index.ts', contents: buildCompilerIndexTs() }
        ]);

        try {
            await sandbox.runCommand({
                command: 'nango compile',
                timeoutMs: compileTimeoutMs,
                envs: { NO_COLOR: '1' }
            });
        } catch (err) {
            if (err instanceof SandboxCommandExitError) {
                throw new CompilerError(getCommandOutput(err, 'Compilation failed'), 'compilation');
            }
            if (err instanceof SandboxCommandTimeoutError) {
                throw new FunctionError({ code: 'timeout', message: 'Compilation timed out', status: 504 });
            }
            throw err;
        }

        const bundledJs = await sandbox.readTextFile(cjsFilePath);

        return {
            bundledJs,
            bundleSizeBytes: Buffer.byteLength(bundledJs, 'utf8')
        };
    } finally {
        await sandbox.stop().catch(() => undefined);
    }
}

export function getCompilerFilePaths(): {
    tsFilePath: string;
    cjsFilePath: string;
} {
    return {
        tsFilePath: 'function/functions/function.ts',
        cjsFilePath: 'build/function_functions_function.cjs'
    };
}

export function buildCompilerIndexTs(): string {
    return "import './function/functions/function.js';\n";
}

export function getFilePaths(request: FunctionFilePathRequest): {
    tsFilePath: string;
    cjsFilePath: string;
} {
    const folder = request.function_type === 'action' ? 'actions' : 'syncs';
    const tsFilePath = `${request.integration_id}/${folder}/${request.function_name}.ts`;
    const cjsFilePath = `build/${request.integration_id}_${folder}_${request.function_name}.cjs`;
    return { tsFilePath, cjsFilePath };
}

export function buildIndexTs(request: FunctionFilePathRequest): string {
    const folder = request.function_type === 'action' ? 'actions' : 'syncs';
    return `import './${request.integration_id}/${folder}/${request.function_name}.js';\n`;
}
