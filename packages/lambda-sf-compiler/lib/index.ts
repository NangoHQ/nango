import { compileAndBuildFlow } from './services/compile.js';
import { cleanupSfWorkspace, createSfWorkspace } from './services/workspace.js';
import { compileRequestSchema } from './schemas.js';

import type { CompileResponse, SfFunctionType } from './schemas.js';

// Lambda handler for sf-compiler.
// Receives TypeScript source code, compiles and bundles it, and returns the flow config and bundled JS.
// The server is responsible for persisting the bundle and calling deploy().
export const handler = async (event: unknown): Promise<CompileResponse> => {
    const parsed = compileRequestSchema.safeParse(event);
    if (!parsed.success) {
        return {
            success: false,
            step: 'validation',
            message: `Invalid request: ${parsed.error.message}`
        };
    }

    const { integration_id, function_name, function_type, code } = parsed.data;

    let workspacePath: string | null = null;

    try {
        const workspace = await createSfWorkspace({
            integrationId: integration_id,
            functionName: function_name,
            functionType: function_type as SfFunctionType,
            code
        });
        workspacePath = workspace.workspacePath;

        const { flow, bundledJs } = await compileAndBuildFlow({
            workspacePath: workspace.workspacePath,
            entryTsPath: workspace.entryTsPath,
            virtualScriptPath: workspace.virtualScriptPath,
            compiledScriptPath: workspace.compiledScriptPath,
            functionType: function_type as SfFunctionType,
            functionName: function_name,
            integrationId: integration_id,
            sourceCode: code
        });

        return {
            success: true,
            bundledJs,
            flow
        };
    } catch (err) {
        return {
            success: false,
            step: 'compilation',
            message: err instanceof Error ? err.message : String(err),
            ...(err instanceof Error && err.stack ? { stack: err.stack } : {})
        };
    } finally {
        if (workspacePath) {
            await cleanupSfWorkspace(workspacePath);
        }
    }
};
