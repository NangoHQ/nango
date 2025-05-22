import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import jscodeshift from 'jscodeshift';
import ora from 'ora';

import { Err, Ok } from '../../utils/result.js';
import { printDebug } from '../../utils.js';
import { NANGO_VERSION } from '../../version.js';
import { compileAll } from '../../zeroYaml/compile.js';
import { compileAllFiles } from '../compile.service.js';
import { loadYamlAndGenerate } from '../model.service.js';

import type { NangoModel, NangoModelField, NangoYamlParsed, ParsedNangoAction, ParsedNangoSync, Result } from '@nangohq/types';
import type { Collection } from 'jscodeshift';

const allowedTypesImports = ['NangoSync', 'NangoAction', 'ActionError', 'ProxyConfiguration'];
const batchMethods = ['batchSave', 'batchUpdate', 'batchDelete'];

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
        const spinner = ora({ text: 'Add package.json' }).start();
        await addPackageJson({ fullPath, debug });
        spinner.succeed();
    }

    for (const integration of parsed.integrations) {
        for (const sync of integration.syncs) {
            const fp = path.join(integration.providerConfigKey, 'syncs', `${sync.name}.ts`);
            const targetFile = path.join(fullPath, fp);

            const spinner = ora({ text: `Migrating: ${fp}` }).start();
            try {
                const content = await getContent({ targetFile });

                const transformed = transformSync({ sync, content, models: parsed.models });

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
                const content = await getContent({ targetFile });

                const transformed = transformAction({ action, content, models: parsed.models });

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
                    const content = await getContent({ targetFile });

                    const transformed = transformOnEvents({ eventType: onEventScript[0], content });

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

    {
        const spinner = ora({ text: 'Running npm install' }).start();
        await runNpmInstall(fullPath);
        spinner.succeed();
    }

    {
        const spinner = ora({ text: 'Generating index.ts' }).start();
        await generateIndexTs({ fullPath, parsed });
        spinner.succeed();
    }

    {
        const spinner = ora({ text: 'Deleting nango.yaml and models.ts' }).start();
        await fs.promises.rm(path.join(fullPath, 'nango.yaml'));
        await fs.promises.rm(path.join(fullPath, 'models.ts'));
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
 * Runs npm install in the given directory
 */
async function runNpmInstall(fullPath: string): Promise<void> {
    await new Promise((resolve, reject) => {
        const proc = spawn('npm', ['install', '--no-audit', '--no-fund', '--no-progress'], {
            cwd: fullPath,
            stdio: 'inherit',
            shell: true
        });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve(undefined);
            } else {
                reject(new Error(`npm install failed with exit code ${code}`));
            }
        });
    });
}

/**
 * Helper to remove type annotations from parameters and build an exec property for jscodeshift AST nodes
 */
function buildExecProp(j: typeof jscodeshift, func: any) {
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

    addZodImport({ root, j });

    modelToZod({ j, root, usedModels: sync.usedModels, models });

    // Remove batch type arguments from all functions
    removeBatchTypeArguments({ root, j });

    // Wrap default function
    root.find(j.ExportDefaultDeclaration).forEach((path) => {
        const func = path.node.declaration;
        if (func.type !== 'FunctionDeclaration') {
            return;
        }

        const execProp = buildExecProp(j, func);

        // Creats default props
        const descriptionProp = j.objectProperty(j.identifier('description'), j.stringLiteral(sync.description));
        const versionProp = j.objectProperty(j.identifier('version'), j.stringLiteral(sync.version || '0.0.1'));
        const runsProp = j.objectProperty(j.identifier('runs'), j.stringLiteral(sync.runs));
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
        const props = [descriptionProp, versionProp, runsProp, autoStartProp, syncTypeProp, trackDeletesProp, endpointsProp];

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
        }

        // Add exec prop
        props.push(execProp);

        // Find and move onWebhookPayloadReceived if present
        let onWebhookArrow = null;
        root.find(j.ExportNamedDeclaration).forEach((p) => {
            const decl = p.node.declaration;
            if (decl && decl.type === 'FunctionDeclaration' && decl.id && decl.id.name === 'onWebhookPayloadReceived') {
                const webhookExecProp = buildExecProp(j, decl);
                // Extract the arrow function from the exec property
                onWebhookArrow = webhookExecProp.value;

                // Remove the original function declaration
                j(p).remove();
            }
        });
        if (onWebhookArrow) {
            props.push(j.objectProperty(j.identifier('onWebhook'), onWebhookArrow));
        }

        const obj = j.objectExpression(props);
        path.replace(j.exportDefaultDeclaration(j.callExpression(j.identifier('createSync'), [obj])));
    });

    // Find all used Types in the file that might be available in "nango"
    reImportTypes({ root, j });

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

    addZodImport({ root, j });

    modelToZod({ j, root, usedModels: action.usedModels, models });

    // Remove batch type arguments from all functions
    removeBatchTypeArguments({ root, j });

    // Find the default export async function (runAction or similar)
    root.find(j.ExportDefaultDeclaration).forEach((path) => {
        const func = path.node.declaration;
        if (func.type !== 'FunctionDeclaration') {
            return;
        }

        const execProp = buildExecProp(j, func);

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
            typeof action.input === 'string' ? j.identifier(action.input) : j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('never')), [])
        );
        props.push(inputProp);

        let outputProp = null;
        if (Array.isArray(action.output) && action.output.length > 0 && typeof action.output[0] === 'string') {
            outputProp = j.objectProperty(j.identifier('output'), j.identifier(action.output[0]));
        } else if (typeof action.output === 'string') {
            outputProp = j.objectProperty(j.identifier('output'), j.identifier(action.output));
        } else {
            outputProp = j.objectProperty(j.identifier('output'), j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('never')), []));
        }
        props.push(outputProp);

        if (Array.isArray(action.scopes) && action.scopes.length > 0) {
            const scopesProp = j.objectProperty(j.identifier('scopes'), j.arrayExpression(action.scopes.map((s) => j.stringLiteral(s))));
            props.push(scopesProp);
        }

        props.push(execProp);
        const obj = j.objectExpression(props);
        path.replace(j.exportDefaultDeclaration(j.callExpression(j.identifier('createAction'), [obj])));
    });

    // Find all used Types in the file that might be available in "nango"
    reImportTypes({ root, j });

    const transformed = root.toSource();
    return transformed;
}

/**
 * Transforms an on-event script to zero-yaml
 */
export function transformOnEvents({ content, eventType }: { content: string; eventType: string }): string {
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

        const execProp = buildExecProp(j, func);

        // Build createOnEvent object
        const eventProp = j.objectProperty(j.identifier('event'), j.stringLiteral(eventType));
        const descriptionProp = j.objectProperty(j.identifier('description'), j.stringLiteral(`${eventType} event handler`));

        const props = [eventProp, descriptionProp, execProp];
        const obj = j.objectExpression(props);
        path.replace(j.exportDefaultDeclaration(j.callExpression(j.identifier('createOnEvent'), [obj])));
    });

    // Find all used Types in the file that might be available in "nango"
    reImportTypes({ root, j });

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
 * Adds an import for zod if it's not present
 */
function addZodImport({ root, j }: { root: Collection; j: jscodeshift.JSCodeshift }) {
    const hasZodImport =
        root
            .find(j.ImportDeclaration)
            .filter((path) => {
                return (
                    path.node.source.value === 'zod' &&
                    Array.isArray(path.node.specifiers) &&
                    path.node.specifiers.some((spec) => spec.type === 'ImportSpecifier' && spec.imported && spec.imported.name === 'z')
                );
            })
            .size() > 0;

    if (!hasZodImport) {
        const importDecl = j.importDeclaration([j.importSpecifier(j.identifier('z'))], j.literal('zod'));
        root.get().node.program.body.unshift(importDecl);
    }
}

/**
 * Converts Nango models to Zod AST and appends them to the file
 */
function modelToZod({ j, root, usedModels, models }: { j: typeof jscodeshift; root: Collection; usedModels: string[]; models: Map<string, NangoModel> }) {
    const referencedModels = usedModels;
    // We sort to ensure that if model A references model B, model B is declared before model A
    const sortedModels = topoSortModels(referencedModels, models);
    const modelDecls: jscodeshift.VariableDeclaration[] = [];
    const typeAliases: jscodeshift.TSTypeAliasDeclaration[] = [];

    for (const modelName of sortedModels) {
        const model = models.get(modelName);
        if (!model) {
            continue;
        }

        // Zod model declaration
        modelDecls.push(j.variableDeclaration('const', [j.variableDeclarator(j.identifier(modelName), nangoModelToZod(j, model, referencedModels))]));
        typeAliases.push(
            j.tsTypeAliasDeclaration(
                j.identifier(modelName),
                j.tsTypeReference(
                    j.tsQualifiedName(j.identifier('z'), j.identifier('infer')),
                    j.tsTypeParameterInstantiation([j.tsTypeQuery(j.identifier(modelName))])
                )
            )
        );
    }

    // Insert model declarations at the top of the file (after imports)
    const body = root.get().node.program.body;
    let lastImportIdx = -1;
    for (let i = 0; i < body.length; i++) {
        if (body[i].type === 'ImportDeclaration') {
            lastImportIdx = i;
        }
    }
    body.splice(lastImportIdx + 1, 0, ...modelDecls, ...typeAliases);
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

/**
 * Converts a NangoModel type to Zod AST
 */
function nangoModelToZod(
    j: typeof jscodeshift,
    model: NangoModel,
    referencedModels: string[]
): jscodeshift.CallExpression | jscodeshift.Identifier | undefined {
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
                return j.objectProperty(j.identifier(field.name), zodAst);
            })
            .filter((prop): prop is ReturnType<typeof j.objectProperty> => !!prop);
        const objectExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('object')), [j.objectExpression(otherProps)]);
        return j.callExpression(j.memberExpression(objectExpr, j.identifier('catchall')), [safeValueType]);
    }

    // regular object
    const properties = model.fields
        .map((field) => {
            const zodAst = nangoTypeToZodAst({ j, field, referencedModels: referencedModels || [] });
            if (!zodAst) return undefined;
            return j.objectProperty(j.identifier(field.name), zodAst);
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
        const nested = nangoModelToZod(j, { name: '', fields: field.value }, referencedModels || []);
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

/**
 * Re-imports allowed types if they are used
 */
function reImportTypes({ root, j }: { root: Collection; j: jscodeshift.JSCodeshift }) {
    // Find all used allowedTypesImports in the file
    const usedAllowedTypes = new Set<string>();
    root.find(j.TSTypeReference).forEach((path) => {
        if (path.node.typeName.type === 'Identifier') {
            const name = path.node.typeName.name;
            if (allowedTypesImports.includes(name)) {
                usedAllowedTypes.add(name);
            }
        }
    });
    if (usedAllowedTypes.size <= 0) {
        return;
    }

    const importTypeDecl = j.importDeclaration(
        Array.from(usedAllowedTypes).map((type) => j.importSpecifier(j.identifier(type))),
        j.literal('nango')
    );
    importTypeDecl.importKind = 'type';
    // Insert after all other imports
    const body = root.get().node.program.body;
    let lastImportIdx = -1;
    for (let i = 0; i < body.length; i++) {
        if (body[i].type === 'ImportDeclaration') {
            lastImportIdx = i;
        }
    }
    body.splice(lastImportIdx + 1, 0, importTypeDecl);
}

/**
 * Adds a package.json file to the given directory if it doesn't exist
 * Otherwise, it updates the existing package.json file
 */
async function addPackageJson({ fullPath, debug }: { fullPath: string; debug: boolean }) {
    // Ensure package.json exists and has nango in devDependencies
    const packageJsonPath = path.join(fullPath, 'package.json');
    const examplePackageJsonPath = path.join(import.meta.dirname, '../../../example/package.json');
    let packageJsonExists = false;
    try {
        await fs.promises.access(packageJsonPath, fs.constants.F_OK);
        packageJsonExists = true;
    } catch (_err) {
        packageJsonExists = false;
    }

    if (!packageJsonExists) {
        printDebug('package.json does not exist', debug);
        await fs.promises.copyFile(examplePackageJsonPath, packageJsonPath);
        return;
    }

    printDebug('package.json exists, updating', debug);
    const pkgRaw = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };

    pkg.devDependencies = pkg.devDependencies || {};
    pkg.devDependencies['nango'] = NANGO_VERSION;

    // TODO: check after we publish nango, there was an error when using multiple version of zod
    // const examplePkgRaw = await fs.promises.readFile(examplePackageJsonPath, 'utf-8');
    // const examplePkg = JSON.parse(examplePkgRaw);
    // const zodVersion = (examplePkg.devDependencies && examplePkg.devDependencies['zod'])!;
    // pkg.devDependencies['zod'] = zodVersion;

    // Remove nango and zod from dependencies just in case they were added as prod
    if (pkg.dependencies?.['nango']) {
        delete pkg.dependencies['nango'];
    }
    if (pkg.dependencies?.['zod']) {
        delete pkg.dependencies['zod'];
    }
    await fs.promises.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
}

/**
 * Generates an index.ts file exporting all syncs, actions, and on-event scripts for the given integrations.
 */
async function generateIndexTs({ fullPath, parsed }: { fullPath: string; parsed: NangoYamlParsed }): Promise<void> {
    const indexLines: string[] = [];
    for (const integration of parsed.integrations) {
        const base = integration.providerConfigKey;
        indexLines.push(`// -- Integration: ${base}`);
        for (const sync of integration.syncs) {
            indexLines.push(`export * from './${base}/syncs/${sync.name}.js';`);
        }
        for (const action of integration.actions) {
            indexLines.push(`export * from './${base}/actions/${action.name}.js';`);
        }
        for (const [_eventType, eventNames] of Object.entries(integration.onEventScripts)) {
            for (const eventName of eventNames) {
                indexLines.push(`export * from './${base}/on-events/${eventName}.js';`);
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
                    batchMethods.includes(callee.property.name)
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
