import { randomUUID } from 'node:crypto';

import { CommandExitError, Sandbox } from 'e2b';

import { e2bCompilerHarness } from './compiler-client.e2b.harness.js';

import type { CLIDeployFlowConfig } from '@nangohq/types';

export interface SfCompileRequest {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
    code: string;
}

export interface CompileResult {
    bundledJs: string;
    flow: CLIDeployFlowConfig;
}

export class SfCompilerError extends Error {
    public readonly step: 'validation' | 'compilation';

    constructor(message: string, step: 'validation' | 'compilation', remoteStack?: string) {
        super(message);
        this.name = 'SfCompilerError';
        this.step = step;
        if (remoteStack !== undefined) {
            this.stack = remoteStack;
        }
    }
}

const compilerRequestPath = '/tmp/nango-sf-compile-request.json';
const compilerHarnessPath = '/tmp/nango-sf-compile.mjs';
const compilerProjectPath = '/home/user/nango-integrations';
const compilerTimeoutMs = 3 * 60 * 1000;

type E2BCompileResponse =
    | { success: true; bundledJs: string; flow: CompileResult['flow'] }
    | { success: false; step: 'validation' | 'compilation'; message: string; stack?: string };

export async function invokeCompiler(request: SfCompileRequest): Promise<CompileResult> {
    if (!process.env['E2B_API_KEY']) {
        throw new Error('E2B_API_KEY is required for the E2B compiler runtime');
    }

    const sandbox = await Sandbox.create(process.env['E2B_COMPILER_TEMPLATE'] || 'nango-sf-compiler', {
        timeoutMs: compilerTimeoutMs,
        allowInternetAccess: true,
        metadata: {
            purpose: 'nango-compiler',
            requestId: randomUUID()
        },
        network: {
            allowPublicTraffic: true
        }
    });

    try {
        await sandbox.files.write(compilerRequestPath, JSON.stringify(request));
        await sandbox.files.write(compilerHarnessPath, e2bCompilerHarness);

        try {
            const response = await sandbox.commands.run(`node ${compilerHarnessPath} ${compilerRequestPath}`, {
                cwd: compilerProjectPath,
                timeoutMs: compilerTimeoutMs
            });
            const parsed = parseE2BCompileResponse(response.stdout);
            if (!parsed.success) {
                throw new SfCompilerError(parsed.message, parsed.step, parsed.stack);
            }

            return {
                bundledJs: parsed.bundledJs,
                flow: parsed.flow
            };
        } catch (error) {
            if (error instanceof CommandExitError) {
                const parsed = parseE2BCompileResponse(error.stdout || error.stderr);
                if (!parsed.success) {
                    throw new SfCompilerError(parsed.message, parsed.step, parsed.stack);
                }
            }
            throw error;
        }
    } finally {
        await sandbox.kill().catch(() => {});
    }
}

function parseE2BCompileResponse(raw: string): E2BCompileResponse {
    if (!raw) {
        throw new Error('E2B compiler returned an empty response');
    }

    try {
        return JSON.parse(raw.trim()) as E2BCompileResponse;
    } catch (error) {
        throw new Error(`Failed to parse E2B compiler response: ${error instanceof Error ? error.message : String(error)}\n${raw}`);
    }
}
