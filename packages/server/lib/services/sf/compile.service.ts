import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as vm from 'node:vm';
import * as url from 'node:url';

import { build } from 'esbuild';
import ts from 'typescript';
import * as z from 'zod';

import * as nangoScript from '@nangohq/runner-sdk';

import type { CLIDeployFlowConfig, SfFunctionType } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const require = createRequire(import.meta.url);

export interface CompiledFlow {
    flow: CLIDeployFlowConfig;
    bundledJs: string;
}

const tsCompilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.Node16,
    target: ts.ScriptTarget.ESNext,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    allowUnusedLabels: false,
    allowUnreachableCode: false,
    exactOptionalPropertyTypes: true,
    noFallthroughCasesInSwitch: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noPropertyAccessFromIndexSignature: true,
    noUncheckedIndexedAccess: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    declaration: false,
    sourceMap: true,
    composite: false,
    checkJs: false,
    noEmit: true
};

const tsconfigRaw = {
    compilerOptions: {
        module: 'node16',
        target: 'esnext',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        moduleResolution: 'node16',
        allowUnusedLabels: false,
        allowUnreachableCode: false,
        exactOptionalPropertyTypes: true,
        noFallthroughCasesInSwitch: true,
        noImplicitOverride: true,
        noImplicitReturns: true,
        noPropertyAccessFromIndexSignature: true,
        noUncheckedIndexedAccess: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        declaration: false,
        sourceMap: true,
        composite: false,
        checkJs: false,
        noEmit: true,
        importsNotUsedAsValues: 'remove',
        jsx: 'react'
    }
};

const npmPackageRegex = /^[^./\s]/;

interface LoadedFunctionDefinition {
    type: SfFunctionType;
    definition: any;
}

export async function compileAndBuildFlow({
    workspacePath,
    entryTsPath,
    virtualScriptPath,
    compiledScriptPath,
    functionType,
    functionName,
    integrationId,
    sourceCode
}: {
    workspacePath: string;
    entryTsPath: string;
    virtualScriptPath: string;
    compiledScriptPath: string;
    functionType: SfFunctionType;
    functionName: string;
    integrationId: string;
    sourceCode: string;
}): Promise<CompiledFlow> {
    const diagnostics = typeCheck({ entryTsPath, workspacePath });
    if (diagnostics.length > 0) {
        throw new Error(formatDiagnostics({ diagnostics, workspacePath }));
    }

    const bundledJs = await bundleEntry({ entryTsPath, workspacePath, virtualScriptPath });
    const loaded = loadFunctionDefinition({ bundledJs, compiledScriptPath, functionType, functionName });
    const flow = buildFlowConfig({
        loaded,
        functionName,
        integrationId,
        sourceCode,
        bundledJs
    });

    return {
        flow,
        bundledJs
    };
}

function typeCheck({ entryTsPath, workspacePath }: { entryTsPath: string; workspacePath: string }): readonly ts.Diagnostic[] {
    const program = ts.createProgram({
        rootNames: [entryTsPath],
        options: tsCompilerOptions
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    return diagnostics.map((diagnostic) => rewriteTsDiagnosticPath({ diagnostic, workspacePath }));
}

function rewriteTsDiagnosticPath({ diagnostic, workspacePath }: { diagnostic: ts.Diagnostic; workspacePath: string }): ts.Diagnostic {
    if (!diagnostic.file?.fileName) {
        return diagnostic;
    }

    const normalized = toStablePath({ absolutePath: diagnostic.file.fileName, workspacePath });
    const sourceFile = ts.createSourceFile(normalized, diagnostic.file.text, diagnostic.file.languageVersion, true);
    return {
        ...diagnostic,
        file: sourceFile
    };
}

function formatDiagnostics({ diagnostics, workspacePath }: { diagnostics: readonly ts.Diagnostic[]; workspacePath: string }): string {
    return diagnostics
        .map((diagnostic) => {
            const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            if (diagnostic.file && diagnostic.start != null) {
                const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                const fileName = toStablePath({ absolutePath: diagnostic.file.fileName, workspacePath });
                return `${fileName}:${line + 1}:${character + 1}\n  ${message}`;
            }
            return message;
        })
        .join('\n');
}

async function bundleEntry({
    entryTsPath,
    workspacePath,
    virtualScriptPath
}: {
    entryTsPath: string;
    workspacePath: string;
    virtualScriptPath: string;
}): Promise<string> {
    try {
        const result = await build({
            entryPoints: [entryTsPath],
            bundle: true,
            sourcemap: 'inline',
            format: 'cjs',
            target: 'esnext',
            platform: 'node',
            logLevel: 'silent',
            treeShaking: true,
            write: false,
            plugins: [
                {
                    name: 'external-npm-packages',
                    setup(buildInstance) {
                        buildInstance.onResolve({ filter: npmPackageRegex }, (args) => {
                            if (!args.path.startsWith('.') && !args.path.startsWith('/') && !args.path.startsWith('..')) {
                                return { path: args.path, external: true };
                            }
                            return null;
                        });
                    }
                }
            ],
            tsconfigRaw: tsconfigRaw as any
        });

        if (!result.outputFiles || result.outputFiles.length === 0) {
            throw new Error('Compilation did not produce output');
        }

        return result.outputFiles[0]!.text;
    } catch (err) {
        if (err && typeof err === 'object' && 'errors' in err && Array.isArray((err as any).errors)) {
            const errors = (err as any).errors as Array<{ text: string; location?: { file?: string; line?: number; column?: number } }>;
            const message = errors
                .map((error) => {
                    if (!error.location?.file) {
                        return error.text;
                    }
                    const file = toStablePath({ absolutePath: error.location.file, workspacePath });
                    const line = error.location.line || 0;
                    const column = error.location.column != null ? error.location.column + 1 : 0;
                    return `${file}:${line}:${column}\n  ${error.text}`;
                })
                .join('\n');
            throw new Error(message || `Failed to compile ${virtualScriptPath}`);
        }

        throw err instanceof Error ? err : new Error(`Failed to compile ${virtualScriptPath}`);
    }
}

function loadFunctionDefinition({
    bundledJs,
    compiledScriptPath,
    functionType,
    functionName
}: {
    bundledJs: string;
    compiledScriptPath: string;
    functionType: SfFunctionType;
    functionName: string;
}): LoadedFunctionDefinition {
    const wrappedCode = `(function() { var module = { exports: {} }; var exports = module.exports; ${bundledJs}\nreturn module.exports; })();`;
    const optionalModules = {
        unzipper: loadOptionalModule('unzipper'),
        soap: loadOptionalModule('soap'),
        botbuilder: loadOptionalModule('botbuilder')
    };

    const script = new vm.Script(wrappedCode, { filename: compiledScriptPath });
    const sandbox: vm.Context = {
        console: new Proxy(
            {},
            {
                get: () => () => {}
            }
        ),
        require: (moduleName: string) => {
            switch (moduleName) {
                case 'url':
                case 'node:url':
                    return url;
                case 'crypto':
                case 'node:crypto':
                    return crypto;
                case 'zod':
                    return z;
                case 'unzipper':
                case 'soap':
                case 'botbuilder': {
                    const loaded = optionalModules[moduleName];
                    if (!loaded) {
                        throw new Error(`Module '${moduleName}' is unavailable in this environment`);
                    }
                    return loaded;
                }
                case 'nango':
                    return nangoScript;
                default:
                    throw new Error(`Module '${moduleName}' is not allowed`);
            }
        },
        Buffer,
        setTimeout,
        Error,
        URL,
        URLSearchParams
    };

    const context = vm.createContext(sandbox);
    const moduleExports = script.runInContext(context) as { default?: unknown };
    const candidate = moduleExports['default'];
    const definition =
        candidate && typeof candidate === 'object' && 'default' in (candidate as Record<string, unknown>)
            ? (candidate as Record<string, unknown>)['default']
            : candidate;

    if (!definition || typeof definition !== 'object') {
        throw new Error(`Function '${functionName}' must default export create${capitalize(functionType)}(...)`);
    }

    const loadedType = (definition as Record<string, unknown>)['type'];
    if (loadedType !== functionType) {
        throw new Error(`Function '${functionName}' exports type '${String(loadedType)}' but '${functionType}' was requested`);
    }

    return {
        type: functionType,
        definition
    };
}

function buildFlowConfig({
    loaded,
    functionName,
    integrationId,
    sourceCode,
    bundledJs
}: {
    loaded: LoadedFunctionDefinition;
    functionName: string;
    integrationId: string;
    sourceCode: string;
    bundledJs: string;
}): CLIDeployFlowConfig {
    const definition = loaded.definition;
    const checkpointFeature: 'checkpoints'[] = definition.checkpoint ? ['checkpoints'] : [];
    const metadata = {
        ...(Array.isArray(definition.scopes) ? { scopes: definition.scopes as string[] } : {}),
        ...(typeof definition.description === 'string' ? { description: definition.description as string } : {})
    };

    if (loaded.type === 'action') {
        if (!(definition.input instanceof z.ZodType) || !(definition.output instanceof z.ZodType)) {
            throw new Error(`Action '${functionName}' must declare both input and output zod schemas`);
        }

        const integrationIdClean = sanitizeForIdentifier(integrationId, '_');
        const functionNameClean = sanitizeForIdentifier(functionName, '');
        const inputName = `ActionInput_${integrationIdClean}_${functionNameClean}`;
        const outputName = `ActionOutput_${integrationIdClean}_${functionNameClean}`;
        const modelsJsonSchema = buildJsonSchemaDefinitionsFromZodModels({
            [inputName]: definition.input,
            [outputName]: definition.output
        });

        return {
            type: 'action',
            models: [outputName],
            runs: null,
            auto_start: false,
            attributes: {},
            metadata,
            endpoints: definition.endpoint ? [definition.endpoint] : [],
            track_deletes: false,
            providerConfigKey: integrationId,
            input: inputName,
            syncName: functionName,
            fileBody: { js: bundledJs, ts: sourceCode },
            ...(typeof definition.version === 'string' ? { version: definition.version as string } : {}),
            models_json_schema: modelsJsonSchema,
            features: checkpointFeature
        };
    }

    if (!definition.models || typeof definition.models !== 'object') {
        throw new Error(`Sync '${functionName}' must declare a models object`);
    }

    const frequency = definition.frequency;
    if (typeof frequency !== 'string' || frequency.length === 0) {
        throw new Error(`Sync '${functionName}' must declare a frequency`);
    }

    const models = Object.entries(definition.models as Record<string, unknown>);
    const invalidModel = models.find(([_, schema]) => !(schema instanceof z.ZodType));
    if (invalidModel) {
        throw new Error(`Sync '${functionName}' has an invalid zod model declaration`);
    }

    const integrationIdClean = sanitizeForIdentifier(integrationId, '_');
    const functionNameClean = sanitizeForIdentifier(functionName, '');
    const metadataModelName = definition.metadata instanceof z.ZodType ? `SyncMetadata_${integrationIdClean}_${functionNameClean}` : undefined;
    const zodModels = Object.fromEntries(models) as Record<string, z.ZodTypeAny>;
    if (metadataModelName && definition.metadata instanceof z.ZodType) {
        zodModels[metadataModelName] = definition.metadata;
    }

    return {
        type: 'sync',
        models: models.map(([name]) => name),
        runs: frequency,
        auto_start: definition.autoStart === true,
        attributes: {},
        metadata,
        endpoints: Array.isArray(definition.endpoints) ? definition.endpoints : [],
        track_deletes: definition.trackDeletes === true,
        providerConfigKey: integrationId,
        input: metadataModelName,
        syncName: functionName,
        fileBody: { js: bundledJs, ts: sourceCode },
        ...(typeof definition.version === 'string' ? { version: definition.version as string } : {}),
        ...(definition.syncType === 'incremental' ? { sync_type: 'incremental' as const } : { sync_type: 'full' as const }),
        webhookSubscriptions: Array.isArray(definition.webhookSubscriptions) ? (definition.webhookSubscriptions as string[]) : [],
        models_json_schema: buildJsonSchemaDefinitionsFromZodModels(zodModels),
        features: checkpointFeature
    };
}

function sanitizeForIdentifier(value: string, replacement: string): string {
    return value.replaceAll(/[^a-zA-Z0-9]/g, replacement);
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function toStablePath({ absolutePath, workspacePath }: { absolutePath: string; workspacePath: string }): string {
    const normalizedAbsolute = absolutePath.replaceAll('\\', '/');
    const normalizedWorkspace = workspacePath.replaceAll('\\', '/');
    if (normalizedAbsolute.startsWith(normalizedWorkspace)) {
        return normalizedAbsolute.slice(normalizedWorkspace.length).replace(/^\//, '');
    }
    return normalizedAbsolute;
}

function zodSchemaToJsonSchema(schema: z.ZodTypeAny): JSONSchema7 | null {
    if (schema instanceof z.ZodVoid) {
        return { type: 'null' };
    }

    const jsonSchema = z.toJSONSchema(schema, {
        target: 'draft-7',
        unrepresentable: 'any',
        override(ctx) {
            if (ctx.zodSchema instanceof z.ZodDate) {
                ctx.jsonSchema.type = 'string';
                (ctx.jsonSchema as Record<string, unknown>)['format'] = 'date-time';
            }
        }
    }) as JSONSchema7;

    delete jsonSchema['$schema'];

    return jsonSchema;
}

function buildJsonSchemaDefinitionsFromZodModels(models: Record<string, z.ZodTypeAny>): JSONSchema7 {
    const definitions: Record<string, JSONSchema7> = {};

    for (const [name, model] of Object.entries(models)) {
        const jsonSchema = zodSchemaToJsonSchema(model);
        if (jsonSchema) {
            definitions[name] = jsonSchema;
        }
    }

    return { definitions };
}

function loadOptionalModule(moduleName: 'unzipper' | 'soap' | 'botbuilder'): unknown {
    try {
        return require(moduleName);
    } catch {
        return null;
    }
}
