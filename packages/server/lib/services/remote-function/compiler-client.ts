import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { CommandExitError, Sandbox } from 'e2b';

import { isLocal } from '@nangohq/utils';

import { agentProjectPath } from '../agent/agent-runtime.js';
import { invokeLocalCompiler } from '../local/compiler-client.js';

import type { CLIDeployFlowConfig, FlowsZeroJson, ParsedNangoAction, ParsedNangoSync } from '@nangohq/types';

export interface CompileRequest {
    integration_id: string;
    function_name: string;
    function_type: 'action' | 'sync';
    code: string;
}

export interface CompileResult {
    bundledJs: string;
    bundleSizeBytes: number;
    flow: CLIDeployFlowConfig;
}

export class CompilerError extends Error {
    public readonly step: 'validation' | 'compilation';

    constructor(message: string, step: 'validation' | 'compilation', remoteStack?: string) {
        super(message);
        this.name = 'CompilerError';
        this.step = step;
        if (remoteStack !== undefined) {
            this.stack = remoteStack;
        }
    }
}

const compilerTimeoutMs = 3 * 60 * 1000;
const compilerTemplate = 'blank-workspace:staging';

export async function invokeCompiler(request: CompileRequest): Promise<CompileResult> {
    if (isLocal) {
        return invokeLocalCompiler(request);
    }

    const apiKey = process.env['E2B_API_KEY'];
    if (!apiKey) {
        throw new Error('E2B_API_KEY is required for the E2B compiler runtime');
    }

    const sandbox = await Sandbox.create(compilerTemplate, {
        timeoutMs: compilerTimeoutMs,
        allowInternetAccess: true,
        metadata: { purpose: 'nango-compiler', requestId: randomUUID() },
        network: { allowPublicTraffic: true },
        apiKey
    });

    try {
        const { tsFilePath, cjsFilePath } = getFilePaths(request);

        await sandbox.files.write(path.join(agentProjectPath, tsFilePath), request.code);
        await sandbox.files.write(path.join(agentProjectPath, 'index.ts'), buildIndexTs(request));

        try {
            await sandbox.commands.run('nango compile', {
                cwd: agentProjectPath,
                timeoutMs: compilerTimeoutMs,
                envs: { NO_COLOR: '1' }
            });
        } catch (err) {
            if (err instanceof CommandExitError) {
                throw new CompilerError(err.stderr || err.stdout, 'compilation');
            }
            throw err;
        }

        const [bundledJs, nangoJson] = await Promise.all([
            sandbox.files.read(path.join(agentProjectPath, cjsFilePath)),
            sandbox.files.read(path.join(agentProjectPath, '.nango', 'nango.json'))
        ]);

        const bundledJsStr = String(bundledJs);
        const flow = buildFlowConfig(String(nangoJson), request, bundledJsStr);
        return {
            bundledJs: bundledJsStr,
            bundleSizeBytes: Buffer.byteLength(bundledJsStr, 'utf8'),
            flow
        };
    } finally {
        await sandbox.kill().catch(() => {});
    }
}

/**
 * Returns the source TS path and compiled CJS path relative to the project root.
 */
export function getFilePaths(request: Pick<CompileRequest, 'integration_id' | 'function_name' | 'function_type'>): {
    tsFilePath: string;
    cjsFilePath: string;
} {
    const folder = request.function_type === 'action' ? 'actions' : 'syncs';
    const tsFilePath = `${request.integration_id}/${folder}/${request.function_name}.ts`;
    const cjsFilePath = `build/${request.integration_id}_${folder}_${request.function_name}.cjs`;
    return { tsFilePath, cjsFilePath };
}

/**
 * Minimal index.ts referencing a single entry point.
 */
export function buildIndexTs(request: Pick<CompileRequest, 'integration_id' | 'function_name' | 'function_type'>): string {
    const folder = request.function_type === 'action' ? 'actions' : 'syncs';
    return `import './${request.integration_id}/${folder}/${request.function_name}.js';\n`;
}

/**
 * Parse .nango/nango.json content (from sandbox) and build the CLIDeployFlowConfig the deploy endpoint needs.
 */
export function buildFlowConfig(nangoJsonContent: string, request: CompileRequest, bundledJs: string): CLIDeployFlowConfig {
    const integrations = JSON.parse(nangoJsonContent) as FlowsZeroJson;
    const integration = integrations.find((i) => i.providerConfigKey === request.integration_id);
    const scriptDef =
        request.function_type === 'action'
            ? integration?.actions.find((a) => a.name === request.function_name)
            : integration?.syncs.find((s) => s.name === request.function_name);

    return buildFlowFromDef(scriptDef, request, bundledJs);
}

export function buildFlowFromDef(scriptDef: ParsedNangoSync | ParsedNangoAction | undefined, request: CompileRequest, bundledJs: string): CLIDeployFlowConfig {
    const base: CLIDeployFlowConfig = {
        type: request.function_type,
        syncName: request.function_name,
        providerConfigKey: request.integration_id,
        models: scriptDef?.output || [],
        runs: null,
        track_deletes: false,
        attributes: {},
        fileBody: { js: bundledJs, ts: '' },
        endpoints: [],
        input: scriptDef?.input ?? undefined,
        models_json_schema: scriptDef?.json_schema,
        features: scriptDef?.features
    };

    if (scriptDef?.type === 'sync') {
        return {
            ...base,
            runs: scriptDef.runs || null,
            track_deletes: scriptDef.track_deletes,
            auto_start: scriptDef.auto_start,
            endpoints: scriptDef.endpoints,
            webhookSubscriptions: scriptDef.webhookSubscriptions
        };
    }

    if (scriptDef?.type === 'action') {
        return {
            ...base,
            endpoints: scriptDef.endpoint ? [scriptDef.endpoint] : []
        };
    }

    return base;
}
