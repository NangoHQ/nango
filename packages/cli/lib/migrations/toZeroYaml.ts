import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import { glob } from 'glob';
import jscodeshift from 'jscodeshift';
import ora from 'ora';

import { Err, Ok } from '../utils/result.js';
import { detectPackageManager, printDebug } from '../utils.js';
import { NANGO_VERSION } from '../version.js';
import { compileAll } from '../zeroYaml/compile.js';
import { compileAllFiles } from '../services/compile.service.js';
import { loadYamlAndGenerate } from '../services/model.service.js';

import type { NangoModel, NangoModelField, NangoYamlParsed, ParsedNangoAction, ParsedNangoSync, Result } from '@nangohq/types';
import type { Collection, ImportSpecifier } from 'jscodeshift';
import { exampleFolder } from '../zeroYaml/constants.js';
import { syncTsConfig } from '../zeroYaml/utils.js';
import type { PackageJson } from 'type-fest';

const allowedTypesImports = ['ActionError', 'ProxyConfiguration'];
const methodsWithGenericTypeArguments = ['batchSave', 'batchUpdate', 'batchDelete', 'getMetadata'];

export async function migrateToZeroYaml({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<Result<void>> {
    const spinner = ora({ text: 'Precompiling' }).start();
    const { success } = await compileAllFiles({ fullPath, debug });
    if (!success) {
        spinner.fail();
        console.log(chalk.red('Failed to compile. Exiting'));
        return Err('failed_to_precompile');
    }

    const parsed = loadYamlAndGenerate({ fullPath, debug });
    if (!parsed) {
        return Err('failed_to_parse');
    }

    spinner.succeed();

    {
        const spinner = ora({ text: 'Init folder' }).start();
        await addPackageJson({ fullPath, debug });
        await syncTsConfig({ fullPath });
        spinner.succeed();
    }

    {
        const spinner = ora({ text: 'Generating models.ts' }).start();
        const content = generateModelsTs({ parsed });
        // Write to models.ts
        const modelsPath = path.join(fullPath, 'models.ts');
        await fs.promises.writeFile(modelsPath, content);
        spinner.succeed();
    }

    console.log('Processing scripts');
    for (const integration of parsed.integrations) {
        for (const sync of integration.syncs) {
            const fp = path.join(integration.providerConfigKey, 'syncs', `${sync.name}.ts`);
            const targetFile = path.join(fullPath, fp);

            const spinner = ora({ text: `Migrating: ${fp}` }).start();
            try {
                if (await hasSymlinkInPath(targetFile, fullPath)) {
                    spinner.warn('Skipping symlink');
                    continue;
                }

                const content = await getContent({ targetFile });
                const transformed = transformSync({ content, sync, models: parsed.models });
                await fs.promises.writeFile(targetFile, transformed);
                spinner.succeed();
            } catch (err) {
                spinner.fail();
                console.error(chalk.red(err));
                return Err('failed_to_compile_one_file');
            }
        }

        for (const action of integration.actions) {
            const fp = path.join(integration.providerConfigKey, 'actions', `${action.name}.ts`);
            const targetFile = path.join(fullPath, fp);

            const spinner = ora({ text: `Migrating: ${fp}` }).start();
            try {
                if (await hasSymlinkInPath(targetFile, fullPath)) {
                    spinner.warn('Skipping symlink');
                    continue;
                }

                const content = await getContent({ targetFile });
                const transformed = transformAction({ content, action, models: parsed.models });
                await fs.promises.writeFile(targetFile, transformed);
                spinner.succeed();
            } catch (err) {
                spinner.fail();
                console.error(chalk.red(err));
                return Err('failed_to_compile_one_file');
            }
        }

        for (const onEventScript of Object.entries(integration.onEventScripts)) {
            for (const eventName of onEventScript[1]) {
                const fp = path.join(integration.providerConfigKey, 'on-events', `${eventName}.ts`);
                const targetFile = path.join(fullPath, fp);

                const spinner = ora({ text: `Migrating: ${fp}` }).start();
                try {
                    if (await hasSymlinkInPath(targetFile, fullPath)) {
                        spinner.warn('Skipping symlink');
                        continue;
                    }

                    const content = await getContent({ targetFile });
                    const transformed = transformOnEvents({ eventType: onEventScript[0], content, models: parsed.models });
                    await fs.promises.writeFile(targetFile, transformed);
                    spinner.succeed();
                } catch (err) {
                    spinner.fail();
                    console.error(chalk.red(err));
                    return Err('failed_to_compile_one_file');
                }
            }
        }
    }

    // After migration, process all remaining .ts files in fullPath
    {
        console.log('Processing helper files');
        await processHelperFiles({ fullPath, parsed });
    }

    {
        const spinner = ora({ text: 'Installing dependencies' }).start();
        await runPackageManagerInstall(fullPath);
        spinner.succeed();
    }

    {
        const spinner = ora({ text: 'Generating index.ts' }).start();
        await generateIndexTs({ fullPath, parsed });
        spinner.succeed();
    }

    {
        const spinner = ora({ text: 'Deleting nango.yaml' }).start();
        await fs.promises.rm(path.join(fullPath, 'nango.yaml'));
        spinner.succeed();
    }

    {
        await compileAll({ fullPath, debug });
    }

    return Ok(undefined);
}

/**
 * Get script content
 */
async function getContent({ targetFile }: { targetFile: string }): Promise<string> {
    const res = await fs.promises.readFile(targetFile);
    return res.toString();
}

/**
 * Runs package manager install in the given directory
 */
export async function runPackageManagerInstall(fullPath: string): Promise<void> {
    await new Promise((resolve, reject) => {
        const packageManager = detectPackageManager({ fullPath });
        const proc = spawn(packageManager, ['install', ...(packageManager === 'npm' ? ['--no-audit', '--no-fund', '--no-progress'] : [])], {
            cwd: fullPath,
            stdio: 'inherit',
            shell: true
        });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(undefined);
            } else {
                reject(new Error(`"${packageManager} install" failed with exit code ${code}`));
            }
        });
    });
}

/**
 * Helper to remove type annotations from parameters and build an exec property for jscodeshift AST nodes
 */
function buildExecProp(j: typeof jscodeshift, func: any, execReturnType?: string) {
    let params;
    let bodyNode;
    let isAsync = false;
    if (func.type === 'FunctionDeclaration') {
        params = func.params.map((param: any) => {
            if (param.type === 'Identifier') {
                return j.identifier(param.name);
            }
            return param;
        });
        bodyNode = func.body;
        isAsync = !!func.async;
    } else {
        params = func.params;
        bodyNode = func.body;
        isAsync = !!func.async;
    }
    params[0].extra = { ...(params[0].extra || {}), parenthesized: true };
    const execArrow = j.arrowFunctionExpression(params, bodyNode);
    execArrow.async = isAsync;
    // Add return type if provided
    if (execReturnType) {
        execArrow.returnType = j.tsTypeAnnotation(
            j.tsTypeReference(j.identifier('Promise'), j.tsTypeParameterInstantiation([j.tsTypeReference(j.identifier(execReturnType))]))
        );
    }
    return j.objectProperty(j.identifier('exec'), execArrow);
}

/**
 * Transforms a sync to zero-yaml
 */
export function transformSync({ content, sync, models }: { content: string; sync: ParsedNangoSync; models: Map<string, NangoModel> }): string {
    const j = jscodeshift.withParser('ts');
    const root = j(content);

    removeLegacyImports({ root, j });

    // Add import { createSync } from 'nango'
    const importDecl = j.importDeclaration([j.importSpecifier(j.identifier('createSync'))], j.literal('nango'));
    root.get().node.program.body.unshift(importDecl);

    // Remove batch type arguments from all functions
    removeBatchTypeArguments({ root, j });

    // Wrap default function
    root.find(j.ExportDefaultDeclaration).forEach((path) => {
        const func = path.node.declaration;
        if (func.type !== 'FunctionDeclaration') {
            return;
        }

        // Preserve leading comments
        const leadingComments = (func as any).leadingComments || (path.node as any).leadingComments;

        const execProp = buildExecProp(j, func);

        // Creats default props
        const descriptionProp = j.objectProperty(j.identifier('description'), j.stringLiteral(sync.description));
        const versionProp = j.objectProperty(j.identifier('version'), j.stringLiteral(sync.version || '0.0.1'));
        const frequencyProp = j.objectProperty(j.identifier('frequency'), j.stringLiteral(sync.runs));
        const autoStartProp = j.objectProperty(j.identifier('autoStart'), j.booleanLiteral(sync.auto_start));
        const syncTypeProp = j.objectProperty(j.identifier('syncType'), j.stringLiteral(sync.sync_type));
        const trackDeletesProp = j.objectProperty(j.identifier('trackDeletes'), j.booleanLiteral(sync.track_deletes));
        const endpointsProp = j.objectProperty(
            j.identifier('endpoints'),
            j.arrayExpression(
                sync.endpoints.map((ep) =>
                    j.objectExpression(
                        Object.entries(ep)
                            .map(([k, v]) => {
                                if (typeof v === 'string') {
                                    return j.objectProperty(j.identifier(k), j.stringLiteral(v));
                                }
                                return null;
                            })
                            .filter((prop): prop is jscodeshift.ObjectProperty => !!prop)
                    )
                )
            )
        );
        const props = [descriptionProp, versionProp, frequencyProp, autoStartProp, syncTypeProp, trackDeletesProp, endpointsProp];

        if (sync.webhookSubscriptions.length > 0) {
            const webhookSubscriptionsProp = j.objectProperty(
                j.identifier('webhookSubscriptions'),
                Array.isArray(sync.webhookSubscriptions) ? j.arrayExpression(sync.webhookSubscriptions.map((w) => j.stringLiteral(w))) : j.arrayExpression([])
            );
            props.push(webhookSubscriptionsProp);
        }
        if (Array.isArray(sync.scopes) && sync.scopes.length > 0) {
            const scopesProp = j.objectProperty(j.identifier('scopes'), j.arrayExpression(sync.scopes.map((s) => j.stringLiteral(s))));
            props.push(scopesProp);
        }
        if (sync.output) {
            const modelProps = sync.output
                .map((modelName) => {
                    return j.objectProperty(j.identifier(modelName), j.identifier(modelName));
                })
                .filter((prop): prop is ReturnType<typeof j.objectProperty> => !!prop);
            if (modelProps.length > 0) {
                const modelsProp = j.objectProperty(j.identifier('models'), j.objectExpression(modelProps));
                props.push(modelsProp);
            }
        }
        if (sync.input) {
            const metadataProp = j.objectProperty(j.identifier('metadata'), j.identifier(sync.input));
            props.push(metadataProp);
        } else {
            // Default to z.object({}) if no input to avoid more errors on migration
            const metadataProp = j.objectProperty(
                j.identifier('metadata'),
                j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('object')), [j.objectExpression([])])
            );
            props.push(metadataProp);
        }

        // Add exec prop
        props.push(execProp);

        // Find and move onWebhookPayloadReceived if present
        let onWebhookArrow = null;
        let onWebhookComments = null;
        root.find(j.ExportNamedDeclaration).forEach((p) => {
            const decl = p.node.declaration;
            if (decl && decl.type === 'FunctionDeclaration' && decl.id && decl.id.name === 'onWebhookPayloadReceived') {
                const webhookExecProp = buildExecProp(j, decl);
                // Extract the arrow function from the exec property
                onWebhookArrow = webhookExecProp.value;
                // Capture comments
                onWebhookComments = (decl as any).leadingComments || (p.node as any).leadingComments;
                // Remove the original function declaration
                j(p).remove();
            }
        });
        if (onWebhookArrow) {
            const onWebhookProp = j.objectProperty(j.identifier('onWebhook'), onWebhookArrow);
            if (onWebhookComments) {
                (onWebhookProp as any).comments = onWebhookComments;
            }
            props.push(onWebhookProp);
        }

        const obj = j.objectExpression(props);
        const syncVar = j.variableDeclaration('const', [j.variableDeclarator(j.identifier('sync'), j.callExpression(j.identifier('createSync'), [obj]))]);
        if (leadingComments) {
            syncVar.comments = leadingComments;
        }
        const nangoType = createNangoLocalType({ j, name: 'NangoSyncLocal', variable: 'sync' });
        const exportDefault = j.exportDefaultDeclaration(j.identifier('sync'));
        path.replace(syncVar, nangoType, exportDefault);
    });

    // Replace all type references to NangoAction with new type Nango
    root.find(j.TSTypeReference).forEach((path) => {
        if (path.node.typeName.type === 'Identifier' && path.node.typeName.name === 'NangoSync') {
            path.node.typeName.name = 'NangoSyncLocal';
        }
    });

    // Find all used Types in the file that might be available in "nango"
    const allModelNames = Array.from(models.keys());
    reImportTypes({ root, j, usedModels: allModelNames });

    const transformed = root.toSource();

    return transformed;
}

/**
 * Transforms an action to zero-yaml
 */
export function transformAction({ content, action, models }: { content: string; action: ParsedNangoAction; models: Map<string, NangoModel> }): string {
    const j = jscodeshift.withParser('ts');
    const root = j(content);

    removeLegacyImports({ root, j });

    // Add import { createAction } from 'nango'
    const importDecl = j.importDeclaration([j.importSpecifier(j.identifier('createAction'))], j.literal('nango'));
    root.get().node.program.body.unshift(importDecl);

    // Remove batch type arguments from all functions
    removeBatchTypeArguments({ root, j });

    // Find the default export async function (runAction or similar)
    root.find(j.ExportDefaultDeclaration).forEach((path) => {
        const func = path.node.declaration;
        if (func.type !== 'FunctionDeclaration') {
            return;
        }

        // Preserve leading comments
        const leadingComments = (func as any).leadingComments || (path.node as any).leadingComments;

        // Determine output type for exec return type
        let outputType: string | undefined = undefined;
        if (Array.isArray(action.output) && action.output.length > 0 && typeof action.output[0] === 'string') {
            outputType = action.output[0];
        } else if (typeof action.output === 'string') {
            outputType = action.output;
        }

        const execProp = buildExecProp(j, func, outputType);

        // Build createAction object
        const descriptionProp = j.objectProperty(j.identifier('description'), j.stringLiteral(action.description));
        const versionProp = j.objectProperty(j.identifier('version'), j.stringLiteral(action.version || '0.0.1'));
        const props = [descriptionProp, versionProp];

        if (action.endpoint) {
            const endpointProp = j.objectProperty(
                j.identifier('endpoint'),
                j.objectExpression(
                    Object.entries(action.endpoint)
                        .map(([k, v]) => {
                            if (typeof v === 'string') {
                                return j.objectProperty(j.identifier(k), j.stringLiteral(v));
                            }
                            return null;
                        })
                        .filter((prop): prop is jscodeshift.ObjectProperty => !!prop)
                )
            );
            props.push(endpointProp);
        }

        const inputProp = j.objectProperty(
            j.identifier('input'),
            typeof action.input === 'string' ? j.identifier(action.input) : j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('void')), [])
        );
        props.push(inputProp);

        let outputProp = null;
        if (Array.isArray(action.output) && action.output.length > 0 && typeof action.output[0] === 'string') {
            outputProp = j.objectProperty(j.identifier('output'), j.identifier(action.output[0]));
        } else if (typeof action.output === 'string') {
            outputProp = j.objectProperty(j.identifier('output'), j.identifier(action.output));
        } else {
            outputProp = j.objectProperty(j.identifier('output'), j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('void')), []));
        }
        props.push(outputProp);

        if (Array.isArray(action.scopes) && action.scopes.length > 0) {
            const scopesProp = j.objectProperty(j.identifier('scopes'), j.arrayExpression(action.scopes.map((s) => j.stringLiteral(s))));
            props.push(scopesProp);
        }

        props.push(execProp);
        const obj = j.objectExpression(props);
        const actionVar = j.variableDeclaration('const', [j.variableDeclarator(j.identifier('action'), j.callExpression(j.identifier('createAction'), [obj]))]);
        if (leadingComments) {
            actionVar.comments = leadingComments;
        }
        const nangoType = createNangoLocalType({ j, name: 'NangoActionLocal', variable: 'action' });
        const exportDefault = j.exportDefaultDeclaration(j.identifier('action'));
        path.replace(actionVar, nangoType, exportDefault);
    });

    // Replace all type references to NangoAction with new type Nango
    root.find(j.TSTypeReference).forEach((path) => {
        if (path.node.typeName.type === 'Identifier' && path.node.typeName.name === 'NangoAction') {
            path.node.typeName.name = 'NangoActionLocal';
        }
    });

    // Find all used Types in the file that might be available in "nango"
    const allModelNames = Array.from(models.keys());
    reImportTypes({ root, j, usedModels: allModelNames });

    const transformed = root.toSource();
    return transformed;
}

/**
 * Transforms an on-event script to zero-yaml
 */
export function transformOnEvents({ content, eventType, models }: { content: string; eventType: string; models: Map<string, NangoModel> }): string {
    const j = jscodeshift.withParser('ts');
    const root = j(content);

    removeLegacyImports({ root, j });

    // Add import { createOnEvent } from 'nango'
    const importDecl = j.importDeclaration([j.importSpecifier(j.identifier('createOnEvent'))], j.literal('nango'));
    root.get().node.program.body.unshift(importDecl);

    // Remove batch type arguments from all functions
    removeBatchTypeArguments({ root, j });

    // Find the default export async function (onEvent or similar)
    root.find(j.ExportDefaultDeclaration).forEach((path) => {
        const func = path.node.declaration;
        if (func.type !== 'FunctionDeclaration') {
            return;
        }

        // Preserve leading comments
        const leadingComments = (func as any).leadingComments || (path.node as any).leadingComments;

        const execProp = buildExecProp(j, func);

        // Build createOnEvent object
        const eventProp = j.objectProperty(j.identifier('event'), j.stringLiteral(eventType));
        const descriptionProp = j.objectProperty(j.identifier('description'), j.stringLiteral(`${eventType} event handler`));

        const props = [eventProp, descriptionProp, execProp];
        const obj = j.objectExpression(props);
        const exportDefault = j.exportDefaultDeclaration(j.callExpression(j.identifier('createOnEvent'), [obj]));
        if (leadingComments) {
            exportDefault.comments = leadingComments;
        }
        path.replace(exportDefault);
    });

    // Find all used Types in the file that might be available in "nango"
    const allModelNames = Array.from(models.keys());
    reImportTypes({ root, j, usedModels: allModelNames });

    const transformed = root.toSource();
    return transformed;
}

/**
 * Removes legacy imports
 */
function removeLegacyImports({ root, j }: { root: Collection; j: jscodeshift.JSCodeshift }) {
    root.find(j.ImportDeclaration)
        .filter((path) => {
            const source = path.node.source.value;
            return typeof source === 'string' && (/models(\.js)?$/.test(source) || /models(\.js)?$/.test(source.replace(/^.*\//, '')));
        })
        .remove();
}

/**
 * Re-imports allowed types if they are used
 */
function reImportTypes({ root, j, usedModels }: { root: Collection; j: jscodeshift.JSCodeshift; usedModels: string[] }) {
    // Find all used allowedTypesImports in the file
    const usedAllowedTypes = new Set<string>();
    const usedModelTypes = new Set<string>();
    root.find(j.TSTypeReference).forEach((path) => {
        if (path.node.typeName.type !== 'Identifier') {
            return;
        }
        const name = path.node.typeName.name;
        if (allowedTypesImports.includes(name)) {
            usedAllowedTypes.add(name);
        } else if (usedModels.includes(name)) {
            usedModelTypes.add(name);
        }
    });
    // Also find types used in interface extends (e.g., interface X extends ProxyConfiguration)
    root.find(j.TSInterfaceDeclaration).forEach((path) => {
        if (!path.node.extends) {
            return;
        }
        path.node.extends.forEach((ext) => {
            if (ext.expression.type !== 'Identifier') {
                return;
            }
            const name = ext.expression.name;
            if (allowedTypesImports.includes(name)) {
                usedAllowedTypes.add(name);
            }
        });
    });

    // Also find implicit model usages in object properties (e.g., { models: { Input: InputSchema } })
    root.find(j.ObjectProperty).forEach((path) => {
        if (path.node.value.type === 'Identifier' && usedModels.includes(path.node.value.name)) {
            usedModelTypes.add(path.node.value.name);
        }
    });

    // Also find generic type arguments in CallExpression and NewExpression (e.g., nango.ActionError<ActionErrorResponse>)
    function scanTypeArguments(node: any) {
        const typeArgs = node.typeArguments || node.typeParameters;
        if (!typeArgs || !typeArgs.params) {
            return;
        }
        typeArgs.params.forEach((param: any) => {
            if (param.type === 'TSTypeReference' && param.typeName.type === 'Identifier') {
                const name = param.typeName.name;
                if (allowedTypesImports.includes(name)) {
                    usedAllowedTypes.add(name);
                } else if (usedModels.includes(name)) {
                    usedModelTypes.add(name);
                }
            }
        });
    }
    root.find(j.CallExpression).forEach((path) => scanTypeArguments(path.node));
    root.find(j.NewExpression).forEach((path) => scanTypeArguments(path.node));

    // Fallback: scan for all Identifier nodes that match a model name
    root.find(j.Identifier).forEach((path) => {
        const name = path.node.name;
        if (usedModels.includes(name)) {
            usedModelTypes.add(name);
        }
    });

    // Prepare imports
    const importDecls = [];
    if (usedAllowedTypes.size > 0) {
        const importTypeDecl = j.importDeclaration(
            Array.from(usedAllowedTypes).map((type) => j.importSpecifier(j.identifier(type))),
            j.literal('nango')
        );
        importTypeDecl.importKind = 'type';
        importDecls.push(importTypeDecl);
    }
    if (usedModelTypes.size > 0) {
        importDecls.push(
            j.importDeclaration([...Array.from(usedModelTypes.values()).map((name) => j.importSpecifier(j.identifier(name)))], j.literal('../../models.js'))
        );
    }

    // Import z if any z.* is used (e.g., z.never())
    const usesZ = root.find(j.Identifier, { name: 'z' }).size() > 0;
    const hasZodImport =
        root
            .find(j.ImportDeclaration)
            .filter((path) => path.node.source.value === 'zod')
            .size() > 0;
    if (usesZ && !hasZodImport) {
        importDecls.push(j.importDeclaration([j.importNamespaceSpecifier(j.identifier('z'))], j.literal('zod')));
    }

    // Insert all at once, in order, after the last import
    if (importDecls.length > 0) {
        const body = root.get().node.program.body;
        let insertIdx = 0;
        for (let i = 0; i < body.length; i++) {
            if (body[i].type === 'ImportDeclaration') {
                insertIdx = i + 1;
            }
        }
        body.splice(insertIdx, 0, ...importDecls);
    }
}

/**
 * Adds a package.json file to the given directory if it doesn't exist
 * Otherwise, it updates the existing package.json file
 */
async function addPackageJson({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    // Ensure package.json exists and has nango in devDependencies
    const packageJsonPath = path.join(fullPath, 'package.json');
    const examplePackageJsonPath = path.join(exampleFolder, 'package.json');
    let packageJsonExists = false;
    try {
        await fs.promises.access(packageJsonPath, fs.constants.F_OK);
        packageJsonExists = true;
    } catch {
        packageJsonExists = false;
    }

    const examplePkgRaw = await fs.promises.readFile(examplePackageJsonPath, 'utf-8');
    const examplePkg = JSON.parse(examplePkgRaw) as PackageJson;

    let pkg: PackageJson;
    if (!packageJsonExists) {
        printDebug('package.json does not exist', debug);
        pkg = examplePkg;
        pkg.devDependencies = pkg.devDependencies || {};
        pkg.devDependencies['nango'] = NANGO_VERSION;
    } else {
        printDebug('package.json exists, updating', debug);
        const pkgRaw = await fs.promises.readFile(packageJsonPath, 'utf-8');
        pkg = JSON.parse(pkgRaw) as PackageJson;

        pkg.devDependencies = pkg.devDependencies || {};
        pkg.devDependencies['nango'] = NANGO_VERSION;

        const zodVersion = examplePkg.devDependencies!['zod']!;
        pkg.devDependencies['zod'] = zodVersion;

        // Remove nango and zod from dependencies just in case they were added as prod
        if (pkg.dependencies?.['nango']) {
            delete pkg.dependencies['nango'];
        }
        if (pkg.dependencies?.['zod']) {
            delete pkg.dependencies['zod'];
        }
    }

    await fs.promises.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
}

/**
 * Generates an index.ts file importing all syncs, actions, and on-event scripts for the given integrations.
 */
async function generateIndexTs({ fullPath, parsed }: { fullPath: string; parsed: NangoYamlParsed }): Promise<void> {
    const indexLines: string[] = [];
    for (const integration of parsed.integrations) {
        const base = integration.providerConfigKey;
        indexLines.push(`// -- Integration: ${base}`);
        for (const sync of integration.syncs) {
            indexLines.push(`import './${base}/syncs/${sync.name}.js';`);
        }
        for (const action of integration.actions) {
            indexLines.push(`import './${base}/actions/${action.name}.js';`);
        }
        for (const [_eventType, eventNames] of Object.entries(integration.onEventScripts)) {
            for (const eventName of eventNames) {
                indexLines.push(`import './${base}/on-events/${eventName}.js';`);
            }
        }
        indexLines.push('');
    }
    const indexPath = path.join(fullPath, 'index.ts');
    await fs.promises.writeFile(indexPath, indexLines.join('\n'));
}

/**
 * Removes type arguments from nango.batchSave, batchUpdate, batchDelete calls in all function bodies in the file
 */
function removeBatchTypeArguments({ root, j }: { root: Collection; j: jscodeshift.JSCodeshift }) {
    root.find(j.FunctionDeclaration).forEach((funcPath) => {
        j(funcPath.node.body)
            .find(j.CallExpression)
            .forEach((callPath) => {
                const callee = callPath.node.callee;
                if (
                    callee.type === 'MemberExpression' &&
                    callee.object.type === 'Identifier' &&
                    callee.object.name === 'nango' &&
                    callee.property.type === 'Identifier' &&
                    methodsWithGenericTypeArguments.includes(callee.property.name)
                ) {
                    if ('typeArguments' in callPath.node && callPath.node.typeArguments) {
                        callPath.node.typeArguments = null;
                    }
                    if ('typeParameters' in callPath.node && callPath.node.typeParameters) {
                        callPath.node.typeParameters = null;
                    }
                }
            });
    });
}

/**
 * Generate models.ts with Zod models/types for all models in parsed.models
 */
export function generateModelsTs({ parsed }: { parsed: Pick<NangoYamlParsed, 'models'> }): string {
    const j = jscodeshift.withParser('ts');
    const root = j('');

    // Add import * as z from 'zod';
    root.get().node.program.body.push(j.importDeclaration([j.importNamespaceSpecifier(j.identifier('z'))], j.literal('zod')));

    // Generate all models as Zod schemas and type aliases, and export them
    const allModelNames = Array.from(parsed.models.keys());
    const sortedModels = topoSortModels(allModelNames, parsed.models);
    for (const modelName of sortedModels) {
        const model = parsed.models.get(modelName);
        if (!model) {
            continue;
        }

        // Exported Zod model declaration
        root.get().node.program.body.push(
            j.exportNamedDeclaration(
                j.variableDeclaration('const', [j.variableDeclarator(j.identifier(modelName), nangoModelToZod({ j, model, referencedModels: allModelNames }))]),
                []
            )
        );
        // Exported type alias
        root.get().node.program.body.push(
            j.exportNamedDeclaration(
                j.tsTypeAliasDeclaration(
                    j.identifier(modelName),
                    j.tsTypeReference(
                        j.tsQualifiedName(j.identifier('z'), j.identifier('infer')),
                        j.tsTypeParameterInstantiation([j.tsTypeQuery(j.identifier(modelName))])
                    )
                ),
                []
            )
        );
    }

    // Export all models
    root.get().node.program.body.push(
        j.exportNamedDeclaration(
            j.variableDeclaration('const', [
                j.variableDeclarator(
                    j.identifier('models'),
                    j.objectExpression(sortedModels.map((modelName) => j.objectProperty(j.identifier(modelName), j.identifier(modelName))))
                )
            ])
        )
    );

    return root.toSource();
}

/**
 * Converts a NangoModel type to Zod AST
 */
export function nangoModelToZod({
    j,
    model,
    referencedModels
}: {
    j: typeof jscodeshift;
    model: NangoModel;
    referencedModels?: string[] | undefined;
}): jscodeshift.CallExpression | jscodeshift.Identifier | undefined {
    // Check for dynamic field
    const isDynamic = model.fields.find((field) => {
        if (field.dynamic) {
            return field;
        }
        return false;
    });
    if (isDynamic) {
        // z.object({ ... }).catchall(valueType)
        const valueType = nangoTypeToZodAst({ j, field: isDynamic, referencedModels: referencedModels || [] });
        const safeValueType = valueType ?? j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('any')), []);
        // All other fields
        const otherFields = model.fields.filter((f) => f !== isDynamic);
        const otherProps = otherFields
            .map((field) => {
                const zodAst = nangoTypeToZodAst({ j, field, referencedModels: referencedModels || [] });
                if (!zodAst) return undefined;
                // Use string literal for keys that are not valid identifiers
                const key = isValidIdentifier(field.name) ? j.identifier(field.name) : j.stringLiteral(field.name);
                return j.objectProperty(key, zodAst);
            })
            .filter((prop): prop is ReturnType<typeof j.objectProperty> => !!prop);
        const objectExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('object')), [j.objectExpression(otherProps)]);
        return j.callExpression(j.memberExpression(objectExpr, j.identifier('catchall')), [safeValueType]);
    }

    if (model.isAnon) {
        return nangoTypeToZodAst({ j, field: model.fields[0]!, referencedModels: referencedModels || [] });
    }

    // regular object
    const properties = model.fields
        .map((field) => {
            const zodAst = nangoTypeToZodAst({ j, field, referencedModels: referencedModels || [] });
            if (!zodAst) return undefined;
            // Use string literal for keys that are not valid identifiers
            const key = isValidIdentifier(field.name) ? j.identifier(field.name) : j.stringLiteral(field.name);
            return j.objectProperty(key, zodAst);
        })
        .filter((prop): prop is ReturnType<typeof j.objectProperty> => !!prop);

    return j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('object')), [j.objectExpression(properties)]);
}

/**
 * Converts a NangoModelField type to Zod AST
 */
function nangoTypeToZodAst({
    j,
    field,
    referencedModels
}: {
    j: typeof jscodeshift;
    field: NangoModelField;
    referencedModels?: string[] | undefined;
}): jscodeshift.CallExpression | jscodeshift.Identifier | undefined {
    // Handle union
    if (field.union && Array.isArray(field.value)) {
        const unionArgs = field.value
            .map((v) => nangoTypeToZodAst({ j, field: v, referencedModels }))
            .filter((arg): arg is jscodeshift.CallExpression => !!arg);
        let unionExpr =
            unionArgs.length <= 1
                ? unionArgs[0]!
                : j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('union')), [j.arrayExpression(unionArgs)]);
        if (field.optional) {
            unionExpr = j.callExpression(j.memberExpression(unionExpr, j.identifier('optional')), []);
        }
        return unionExpr;
    }

    // Handle array
    if (field.array) {
        let arrExpr;
        // Array of ts types (no value)
        if (!Array.isArray(field.value)) {
            return j.callExpression(
                j.memberExpression(nangoTypeToZodAst({ j, field: { ...field, array: false }, referencedModels })!, j.identifier('array')),
                []
            );
        }

        // Array of one or multiple values
        const elementTypes: (jscodeshift.CallExpression | jscodeshift.Identifier)[] = [];
        for (const value of field.value) {
            const ast = nangoTypeToZodAst({ j, field: { ...value }, referencedModels });
            if (ast !== undefined) {
                elementTypes.push(ast);
            }
        }

        if (elementTypes.length === 0) {
            return;
        }

        let elementType: jscodeshift.CallExpression | jscodeshift.Identifier;
        if (elementTypes.length === 1) {
            elementType = elementTypes[0]!;
        } else {
            elementType = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('union')), [j.arrayExpression(elementTypes)]);
        }
        arrExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('array')), [elementType]);

        if (field.optional) {
            arrExpr = j.callExpression(j.memberExpression(arrExpr, j.identifier('optional')), []);
        }
        return arrExpr;
    }

    // Handle base types and nested objects
    let baseExpr: jscodeshift.CallExpression;
    if (typeof field.value === 'string') {
        switch (field.value) {
            case 'string':
            case 'number':
            case 'boolean':
            case 'Date':
            case 'any':
                baseExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier(field.value.toLocaleLowerCase())), []);
                break;
            case 'null':
                baseExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('nullable')), []);
                break;
            case 'undefined':
                // return on purpose to skip
                return;
            case 'Record<string, any>':
                baseExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('object')), [j.objectExpression([])]);
                break;
            case 'any[]':
                baseExpr = j.callExpression(
                    j.memberExpression(j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('any')), []), j.identifier('array')),
                    []
                );
                break;
            default:
                baseExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('literal')), [j.stringLiteral(field.value)]);
        }
    } else if (Array.isArray(field.value)) {
        // If not union/array, treat as nested object
        const nested = nangoModelToZod({ j, model: { name: '', fields: field.value }, referencedModels: referencedModels || [] });
        baseExpr = nested
            ? nested.type === 'Identifier'
                ? j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('lazy')), [j.arrowFunctionExpression([], nested)])
                : nested
            : j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('any')), []);
    } else if (field.value === null) {
        baseExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('null')), []);
    } else {
        baseExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('any')), []);
    }

    if (field.optional) {
        baseExpr = j.callExpression(j.memberExpression(baseExpr, j.identifier('optional')), []);
    }

    // Handle model reference
    if (field.model && typeof field.value === 'string' && referencedModels && referencedModels.includes(field.value)) {
        return j.identifier(field.value);
    }

    return baseExpr;
}

// Helper to extract dependencies for a model
function getModelDependencies(model: NangoModel): Set<string> {
    const deps = new Set<string>();
    function walkField(field: NangoModelField) {
        if (field.model && typeof field.value === 'string') {
            deps.add(field.value);
        }
        if (Array.isArray(field.value)) {
            for (const v of field.value) {
                walkField(v);
            }
        }
        if (field.union && Array.isArray(field.value)) {
            for (const v of field.value) {
                walkField(v);
            }
        }
    }
    for (const field of model.fields) {
        walkField(field);
    }
    return deps;
}

// Topological sort
function topoSortModels(modelNames: string[], models: Map<string, NangoModel>): string[] {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const result: string[] = [];

    function visit(name: string) {
        if (visited.has(name)) return;
        if (temp.has(name)) return; // Prevent cycles
        temp.add(name);
        const model = models.get(name);
        if (model) {
            for (const dep of getModelDependencies(model)) {
                if (modelNames.includes(dep)) {
                    visit(dep);
                }
            }
        }
        temp.delete(name);
        visited.add(name);
        result.push(name);
    }

    for (const name of modelNames) {
        visit(name);
    }

    return result;
}

// export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0]
function createNangoLocalType({ j, name, variable }: { j: jscodeshift.JSCodeshift; name: string; variable: string }): jscodeshift.ExportNamedDeclaration {
    return j.exportNamedDeclaration(
        j.tsTypeAliasDeclaration(
            j.identifier(name),
            j.tsIndexedAccessType(
                j.tsTypeReference(
                    j.identifier('Parameters'),
                    j.tsTypeParameterInstantiation([j.tsIndexedAccessType(j.tsTypeQuery(j.identifier(variable)), j.tsLiteralType(j.stringLiteral('exec')))])
                ),
                j.tsLiteralType(j.numericLiteral(0))
            )
        )
    );
}

// Helper: For each file in the list, update model imports for NangoSync/NangoAction
async function processHelperFiles({ fullPath, parsed }: { fullPath: string; parsed: NangoYamlParsed }) {
    const files = await glob('**/*.ts', {
        cwd: fullPath,
        ignore: ['**/.nango/**', '**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true
    });

    // Build list of integration files to process
    const integrationFiles = new Set<string>();
    for (const integration of parsed.integrations) {
        for (const sync of integration.syncs) {
            integrationFiles.add(path.join(fullPath, integration.providerConfigKey, 'syncs', `${sync.name}.ts`));
        }
        for (const action of integration.actions) {
            integrationFiles.add(path.join(fullPath, integration.providerConfigKey, 'actions', `${action.name}.ts`));
        }
        for (const [_, eventNames] of Object.entries(integration.onEventScripts)) {
            for (const name of eventNames) {
                integrationFiles.add(path.join(fullPath, integration.providerConfigKey, 'on-events', `${name}.ts`));
            }
        }
    }

    const ignored = ['/models.ts', '/.nango/schema.ts'];

    // Filter out integration files from the glob list since they were already processed
    for (const absPath of files) {
        if (integrationFiles.has(absPath)) {
            continue;
        }

        const relPath = absPath.replace(fullPath, '');
        if (ignored.includes(relPath)) {
            continue;
        }

        const spinner = ora({ text: `Migrating ${relPath}` }).start();
        if (await hasSymlinkInPath(absPath, fullPath)) {
            spinner.warn('Skipping symlink');
            continue;
        }

        const content = await fs.promises.readFile(absPath, 'utf-8');
        const { root, changed } = processHelperFile({ content });

        if (changed) {
            await fs.promises.writeFile(absPath, root.toSource());
        }
        spinner.succeed();
    }
}

export function processHelperFile({ content }: { content: string }) {
    const allowedTypesImportsHelper = [...allowedTypesImports, 'NangoAction', 'NangoSync'];
    const j = jscodeshift.withParser('ts');
    const root = j(content);
    let changed = false;
    // Find import from models
    root.find(j.ImportDeclaration).forEach((pathNode) => {
        const source = pathNode.node.source.value;
        if (typeof source !== 'string') {
            return;
        }

        // Find NangoSync/NangoAction specifiers (only ImportSpecifier)
        const specifiers = pathNode.node.specifiers || [];
        const nangoSpecifiers = specifiers.filter((s) => isImportSpecifier(s) && allowedTypesImportsHelper.includes(s.imported.name as string));
        if (nangoSpecifiers.length === 0) {
            return;
        }

        // Remove NangoSync/NangoAction from models import
        pathNode.node.specifiers = specifiers.filter((s) => !(isImportSpecifier(s) && allowedTypesImportsHelper.includes(s.imported.name as string)));
        changed = true;
        // Add or update import from 'nango'
        const nangoImport = root.find(j.ImportDeclaration, { source: { value: 'nango' } });
        if (nangoImport.size() > 0) {
            // Add to existing import
            nangoImport.get(0).node.specifiers = [
                ...nangoImport.get(0).node.specifiers,
                ...nangoSpecifiers
                    .filter(isImportSpecifier)
                    .filter((s) => typeof s.imported.name === 'string')
                    .map((s) => {
                        const name = s.imported.name as string;
                        return j.importSpecifier(j.identifier(name));
                    })
            ];
        } else {
            // Add new import
            root.get().node.program.body.unshift(
                j.importDeclaration(
                    nangoSpecifiers
                        .filter(isImportSpecifier)
                        .filter((s) => typeof s.imported.name === 'string')
                        .map((s) => {
                            const name = s.imported.name as string;
                            return j.importSpecifier(j.identifier(name));
                        }),
                    j.literal('nango')
                )
            );
        }
        // If models import is now empty, remove it
        if (!pathNode.node.specifiers || pathNode.node.specifiers.length === 0) {
            j(pathNode).remove();
        }
    });

    return { root, changed };
}

// Helper type guard for ImportSpecifier
function isImportSpecifier(s: unknown): s is ImportSpecifier {
    return (
        typeof s === 'object' &&
        s !== null &&
        'type' in s &&
        (s as any).type === 'ImportSpecifier' &&
        'imported' in s &&
        (s as any).imported &&
        (s as any).imported.type === 'Identifier'
    );
}

const reservedWords = new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
    'let',
    'static',
    'enum',
    'implements',
    'interface',
    'package',
    'private',
    'protected',
    'public',
    'abstract',
    'boolean',
    'byte',
    'char',
    'double',
    'final',
    'float',
    'goto',
    'int',
    'long',
    'native',
    'short',
    'synchronized',
    'throws',
    'transient',
    'volatile'
]);
// Helper to check if a string is a valid JavaScript identifier
function isValidIdentifier(name: string): boolean {
    if (!name || typeof name !== 'string') {
        return false;
    }

    // Can only contain letters, digits, underscores, and dollar signs
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
        return false;
    }

    // Check for reserved words
    return !reservedWords.has(name);
}

// Helper to check if a file or any parent directory is a symlink
async function hasSymlinkInPath(filePath: string, stopAtPath: string): Promise<boolean> {
    let current = path.resolve(filePath);
    while (true) {
        try {
            const stat = await fs.promises.lstat(current);
            if (stat.isSymbolicLink()) {
                return true;
            }
        } catch {
            // ignore
        }

        if (current === stopAtPath) {
            break;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            // reached root
            break;
        }
        current = parent;
    }
    return false;
}
