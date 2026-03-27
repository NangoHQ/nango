import { randomUUID } from 'node:crypto';

import { envs } from '../../env.js';
import { getDaytonaClient } from '../daytona/client.js';
import { daytonaCompilerHarness } from './compiler-client.daytona.harness.js';

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
const compilerProjectPath = '/home/daytona/nango-integrations';
const compilerTimeoutSeconds = 180;

type DaytonaCompileResponse =
    | { success: true; bundledJs: string; flow: CompileResult['flow'] }
    | { success: false; step: 'validation' | 'compilation'; message: string; stack?: string };

export async function invokeCompiler(request: SfCompileRequest): Promise<CompileResult> {
    const sandbox = await getDaytonaClient().create(
        {
            name: `sf-compiler-${randomUUID()}`,
            snapshot: envs.DAYTONA_COMPILER_SNAPSHOT,
            autoStopInterval: 0,
            autoDeleteInterval: -1
        },
        { timeout: compilerTimeoutSeconds }
    );

    try {
        await sandbox.fs.uploadFile(Buffer.from(JSON.stringify(request)), compilerRequestPath);
        await sandbox.fs.uploadFile(Buffer.from(daytonaCompilerHarness), compilerHarnessPath);

        const response = await sandbox.process.executeCommand(`node ${compilerHarnessPath} ${compilerRequestPath}`, compilerProjectPath, undefined, compilerTimeoutSeconds);
        const parsed = parseDaytonaCompileResponse(response.result);
        if (!parsed.success) {
            throw new SfCompilerError(parsed.message, parsed.step, parsed.stack);
        }

        return {
            bundledJs: parsed.bundledJs,
            flow: parsed.flow
        };
    } finally {
        await sandbox.delete(compilerTimeoutSeconds).catch(() => {});
    }
}

function parseDaytonaCompileResponse(raw: string): DaytonaCompileResponse {
    if (!raw) {
        throw new Error('Daytona compiler returned an empty response');
    }

    try {
        return JSON.parse(raw.trim()) as DaytonaCompileResponse;
    } catch (error) {
        throw new Error(`Failed to parse Daytona compiler response: ${error instanceof Error ? error.message : String(error)}\n${raw}`);
    }
}
