import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CommandExitError, Sandbox } from 'e2b';

import { loadNangoYaml } from '@nangohq/nango-yaml';
import { isLocal } from '@nangohq/utils';

import { agentProjectPath } from '../agent/agent-runtime.js';
import { invokeLocalCompiler } from '../local/compiler-client.js';

import type { CLIDeployFlowConfig, ParsedNangoAction, ParsedNangoSync } from '@nangohq/types';

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

export async function invokeCompiler(request: CompileRequest): Promise<CompileResult> {
    if (isLocal) {
        return invokeLocalCompiler(request);
    }

    if (!process.env['SANDBOX_API_KEY']) {
        throw new Error('SANDBOX_API_KEY is required for the E2B compiler runtime');
    }

    const sandbox = await Sandbox.create(process.env['SANDBOX_COMPILER_TEMPLATE'] || 'nango-sf-compiler', {
        timeoutMs: compilerTimeoutMs,
        allowInternetAccess: true,
        metadata: { purpose: 'nango-compiler', requestId: randomUUID() },
        network: { allowPublicTraffic: true }
    });

    try {
        const { tsFilePath, cjsFilePath } = getFilePaths(request);

        await sandbox.files.write(path.join(agentProjectPath, tsFilePath), request.code);
        await sandbox.files.write(path.join(agentProjectPath, 'index.ts'), buildIndexTs(request));
        await sandbox.files.write(path.join(agentProjectPath, 'nango.yaml'), buildNangoYaml(request));

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

        const [bundledJs, yamlContent] = await Promise.all([
            sandbox.files.read(path.join(agentProjectPath, cjsFilePath)),
            sandbox.files.read(path.join(agentProjectPath, 'nango.yaml'))
        ]);

        const bundledJsStr = String(bundledJs);
        const flow = await buildFlowConfig(String(yamlContent), request, bundledJsStr);
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
 * Minimal nango.yaml so that `nango compile` has a valid project definition.
 * The agent is expected to have written a more complete yaml; this is a fallback
 * for cases where the compile endpoint is called without one in the sandbox.
 */
export function buildNangoYaml(request: Pick<CompileRequest, 'integration_id' | 'function_name' | 'function_type'>): string {
    if (request.function_type === 'action') {
        return `integrations:\n  - providerConfigKey: ${request.integration_id}\n    actions:\n      - name: ${request.function_name}\n`;
    }
    return `integrations:\n  - providerConfigKey: ${request.integration_id}\n    syncs:\n      - name: ${request.function_name}\n        runs: every 30min\n`;
}

/**
 * Parse nango.yaml content (from sandbox) and build the CLIDeployFlowConfig the deploy endpoint needs.
 * Writes to a temp dir so loadNangoYaml can read it from disk.
 */
export async function buildFlowConfig(yamlContent: string, request: CompileRequest, bundledJs: string): Promise<CLIDeployFlowConfig> {
    const tempDir = path.join(tmpdir(), `nango-compile-${randomUUID()}`);
    try {
        await mkdir(tempDir, { recursive: true });
        await writeFile(path.join(tempDir, 'nango.yaml'), yamlContent, 'utf8');

        const parser = loadNangoYaml({ fullPath: tempDir });
        parser.parse();

        const integration = parser.parsed?.integrations.find((i) => i.providerConfigKey === request.integration_id);
        const scriptDef =
            request.function_type === 'action'
                ? integration?.actions.find((a) => a.name === request.function_name)
                : integration?.syncs.find((s) => s.name === request.function_name);

        return buildFlowFromDef(scriptDef, request, bundledJs);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
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
