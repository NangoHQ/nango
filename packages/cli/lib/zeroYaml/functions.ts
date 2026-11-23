import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';

import { Err, Ok } from '../utils/result.js';
import { resolveProjectPath, tsToJsPath } from './project-path.js';

import type { FunctionConfig } from './definitions.js';
import type { ResolvedProjectPath } from './project-path.js';
import type { FunctionDeploymentArtifact, FunctionReconciliationScope, PostFunctionDeploymentBundle, Result, ScriptFileType } from '@nangohq/types';

export type FunctionsBundle = PostFunctionDeploymentBundle['Body'];

export function resolveDeploySource(): FunctionDeploymentArtifact['source'] {
    return process.env['NANGO_DEPLOY_SOURCE'] === 'standalone' ? 'standalone' : 'repo';
}

export async function createFunctionsBundle({
    fullPath,
    functionConfigs,
    reconciliationScope,
    source
}: {
    fullPath: string;
    functionConfigs: FunctionConfig[];
    reconciliationScope: FunctionReconciliationScope;
    source: 'standalone' | 'repo';
}): Promise<Result<FunctionsBundle>> {
    const selectedConfigs = functionConfigs.filter((config) => {
        switch (reconciliationScope.kind) {
            case 'environment':
                return true;
            case 'function':
                return config.integrationId === reconciliationScope.integrationId && config.name === reconciliationScope.name;
            case 'integration':
                return config.integrationId === reconciliationScope.integrationId;
        }
    });
    if (reconciliationScope.kind === 'function' && selectedConfigs.length === 0) {
        return Err(new Error(`No compiled function found for "${reconciliationScope.name}"`));
    }

    const functions: FunctionsBundle['functions'] = [];
    for (const config of selectedConfigs) {
        const { filePath, ...artifact } = config;
        const sourcePath = resolveProjectPath({ projectRoot: fullPath, filePath });
        if (!sourcePath) {
            return Err(new Error(`Function source path "${filePath}" must be within the project directory`));
        }
        const fileBody = await loadScriptFiles({
            fullPath,
            scriptName: config.name,
            providerConfigKey: config.integrationId,
            type: 'functions',
            sourcePath
        });
        if (!fileBody) {
            return Err(new Error(`No function files found for "${config.name}"`));
        }
        functions.push({ ...artifact, fileBody, source });
    }

    return Ok({ reconciliationScope, functions });
}

/**
 * Load source and bundled files
 */
export async function loadScriptFiles({
    fullPath,
    scriptName,
    providerConfigKey,
    type,
    sourcePath
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
    sourcePath?: ResolvedProjectPath;
}): Promise<{ js: string; ts: string } | null> {
    const js = await loadScriptJsFile({
        fullPath,
        scriptName,
        providerConfigKey,
        type,
        ...(sourcePath ? { sourcePath: sourcePath.relative } : {})
    });
    if (!js) {
        return null;
    }

    const ts = await loadScriptTsFile({
        fullPath,
        scriptName,
        providerConfigKey,
        type,
        ...(sourcePath ? { sourceFilePath: sourcePath.absolute } : {})
    });
    if (!ts) {
        return null;
    }

    return { js, ts };
}

/**
 * Load bundled file
 */
async function loadScriptJsFile({
    scriptName,
    providerConfigKey,
    fullPath,
    type,
    sourcePath
}: {
    scriptName: string;
    type: ScriptFileType;
    providerConfigKey: string;
    fullPath: string;
    sourcePath?: string;
}): Promise<string | null> {
    const filePath = sourcePath
        ? path.join(fullPath, 'build', tsToJsPath(sourcePath.replace(/\.ts$/, '.js')))
        : path.join(fullPath, 'build', `${providerConfigKey}_${type}_${scriptName}.cjs`);

    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return content;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err instanceof Error ? err.message : err);
        return null;
    }
}

/**
 * Load main source file
 * nb: this is a legacy thing but it should bundle every import too otherwise it's useless
 */
async function loadScriptTsFile({
    fullPath,
    scriptName,
    providerConfigKey,
    type,
    sourceFilePath
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: ScriptFileType;
    sourceFilePath?: string;
}): Promise<string | null> {
    const filePath = sourceFilePath || path.join(fullPath, providerConfigKey, type, `${scriptName}.ts`);

    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return content;
    } catch (err) {
        console.error(chalk.red(`Error loading file ${filePath}`), err instanceof Error ? err.message : err);
        return null;
    }
}
