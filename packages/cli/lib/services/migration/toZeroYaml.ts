import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import jscodeshift from 'jscodeshift';
import ora from 'ora';

import { Err, Ok } from '../../utils/result.js';
import { printDebug } from '../../utils.js';
import { NANGO_VERSION } from '../../version.js';
import { compileAllFiles } from '../compile.service.js';
import { loadYamlAndGenerate } from '../model.service.js';

import type { NangoModel, NangoModelField, ParsedNangoSync, Result } from '@nangohq/types';
import type { Collection } from 'jscodeshift';

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
            const spinner = ora({ text: `Migrating: ${integration.providerConfigKey}/syncs/${sync.name}.ts` }).start();
            try {
                const content = await getContent({ fullPath, integrationId: integration.providerConfigKey, scriptType: 'syncs', scriptName: sync.name });

                const transformed = transformSync({ sync, content, models: parsed.models });

                // Append transformed code after line 55
                const targetFile = path.join(fullPath, integration.providerConfigKey, 'syncs', `${sync.name}.v2.ts`);
                await fs.promises.writeFile(targetFile, transformed);
                spinner.succeed();
            } catch (err) {
                spinner.fail();
                console.error(chalk.red(err));
                return Err('failed_to_compile_one_file');
            }
        }
        // for (const action of integration.actions) {
        //     const spinner = ora({ text: `Migrating: ${integration.providerConfigKey}/syncs/${sync.name}.ts` }).start();
        //     try {
        //         const content = await getContent({ fullPath, integrationId: integration.providerConfigKey, scriptType: 'syncs', scriptName: sync.name });

        //         const transformed = transformSync({ sync, content, models: parsed.models });

        //         // Append transformed code after line 55
        //         const targetFile = path.join(fullPath, integration.providerConfigKey, 'syncs', `${sync.name}.v2.ts`);
        //         await fs.promises.writeFile(targetFile, transformed);
        //         spinner.succeed();
        //     } catch (err) {
        //         spinner.fail();
        //         console.error(chalk.red(err));
        //         return Err('failed_to_compile_one_file');
        //     }
        // }
    }

    // await fs.promises.rm(path.join(fullPath, 'nango.yaml'));
    // await fs.promises.rm(path.join(fullPath, 'models.ts'));

    {
        const spinner = ora({ text: 'Running npm install' }).start();
        await runNpmInstall(fullPath);
        spinner.succeed();
    }

    return Ok(undefined);
}

async function getContent({
    fullPath,
    integrationId,
    scriptType,
    scriptName
}: {
    fullPath: string;
    integrationId: string;
    scriptType: 'syncs' | 'actions' | 'on-events';
    scriptName: string;
}): Promise<string> {
    const res = await fs.promises.readFile(path.join(fullPath, integrationId, scriptType, `${scriptName}.ts`));
    return res.toString();
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
    } else {
        printDebug('package.json exists, updating', debug);
        const pkgRaw = await fs.promises.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };

        const examplePkgRaw = await fs.promises.readFile(examplePackageJsonPath, 'utf-8');
        const examplePkg = JSON.parse(examplePkgRaw);
        const zodVersion = (examplePkg.devDependencies && examplePkg.devDependencies['zod'])!;
        pkg.devDependencies = pkg.devDependencies || {};
        pkg.devDependencies['nango'] = NANGO_VERSION;
        pkg.devDependencies['zod'] = zodVersion;

        // Remove nango and zod from dependencies just in case they were added as prod
        if (pkg.dependencies?.['nango']) {
            delete pkg.dependencies['nango'];
        }
        if (pkg.dependencies?.['zod']) {
            delete pkg.dependencies['zod'];
        }
        await fs.promises.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
    }
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

const allowedTypesImports = ['NangoSync', 'NangoAction', 'ActionError'];
export function transformSync({ content, sync, models }: { content: string; sync: ParsedNangoSync; models: Map<string, NangoModel> }): string {
    const j = jscodeshift.withParser('ts');
    const root = j(content);

    // Remove legacy models import
    root.find(j.ImportDeclaration)
        .filter((path) => {
            const source = path.node.source.value;
            return typeof source === 'string' && (/models(\.js)?$/.test(source) || /models(\.js)?$/.test(source.replace(/^.*\//, '')));
        })
        .remove();

    // Add import { createSync } from 'nango'
    const importDecl = j.importDeclaration([j.importSpecifier(j.identifier('createSync'))], j.literal('nango'));
    root.get().node.program.body.unshift(importDecl);

    addZodImport(root, j);

    // Generate Zod model declarations for all referenced models
    const referencedModels = sync.usedModels;
    const modelDecls: jscodeshift.VariableDeclaration[] = [];
    const typeAliases: jscodeshift.TSTypeAliasDeclaration[] = [];
    for (const modelName of referencedModels) {
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

    // Wrap default function
    root.find(j.ExportDefaultDeclaration).forEach((path) => {
        const func = path.node.declaration;
        if (func.type !== 'FunctionDeclaration') {
            return;
        }

        // Remove type annotations from parameters
        const params = func.params.map((param) => {
            if (param.type === 'Identifier') {
                return j.identifier(param.name);
            }
            return param;
        });
        // Create an object with exec property as the function expression
        const execArrow = j.arrowFunctionExpression(params, func.body);
        execArrow.async = true;
        const execProp = j.objectProperty(j.identifier('exec'), execArrow);

        // Creats default props
        const descriptionProp = j.objectProperty(j.identifier('description'), j.stringLiteral(sync.description));
        const versionProp = j.objectProperty(j.identifier('version'), j.stringLiteral(sync.version || '0.0.1'));
        const runsProp = j.objectProperty(j.identifier('runs'), j.stringLiteral(sync.runs));
        const autoStartProp = j.objectProperty(j.identifier('autoStart'), j.booleanLiteral(sync.auto_start));
        const syncTypeProp = j.objectProperty(j.identifier('syncType'), j.stringLiteral(sync.sync_type));
        const trackDeletesProp = j.objectProperty(j.identifier('trackDeletes'), j.booleanLiteral(sync.track_deletes));
        const endpointsProp = j.objectProperty(
            j.identifier('endpoints'),
            Array.isArray(sync.endpoints)
                ? j.arrayExpression(
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
                : j.arrayExpression([])
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
            const metadataProp = j.objectProperty(
                j.identifier('metadata'),
                j.objectExpression([j.objectProperty(j.identifier(sync.input), j.identifier(sync.input))])
            );
            props.push(metadataProp);
        }

        // Add exec prop
        props.push(execProp);

        // Find and move onWebhookPayloadReceived if present
        let onWebhookArrow = null;
        root.find(j.ExportNamedDeclaration).forEach((p) => {
            const decl = p.node.declaration;
            if (decl && decl.type === 'FunctionDeclaration' && decl.id && decl.id.name === 'onWebhookPayloadReceived') {
                // Remove type annotations from parameters
                const webhookParams = decl.params.map((param) => {
                    if (param.type === 'Identifier') {
                        return j.identifier(param.name);
                    }
                    return param;
                });
                onWebhookArrow = j.arrowFunctionExpression(webhookParams, decl.body);
                onWebhookArrow.async = !!decl.async;
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
    const usedAllowedTypes = new Set<string>();
    root.find(j.TSTypeReference).forEach((path) => {
        if (path.node.typeName.type === 'Identifier') {
            const name = path.node.typeName.name;
            if (allowedTypesImports.includes(name)) {
                usedAllowedTypes.add(name);
            }
        }
    });

    // Add them to the list of imports
    if (usedAllowedTypes.size > 0) {
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

    const transformed = root.toSource();

    return transformed;
}

/**
 * Adds an import for zod if it's not present
 */
function addZodImport(root: Collection, j: jscodeshift.JSCodeshift) {
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
 * Converts a NangoModel type to Zod AST
 */
export function nangoModelToZod(
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
        // z.record(<valueType>).and(z.object({ ... }))
        const valueType = nangoTypeToZodAst(j, isDynamic, referencedModels || []);
        const safeValueType = valueType ?? j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('any')), []);
        // If valueType is an Identifier, wrap in z.lazy(() => Identifier)
        const recordArg =
            valueType && valueType.type === 'Identifier'
                ? j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('lazy')), [j.arrowFunctionExpression([], valueType)])
                : safeValueType;
        const recordExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('record')), [recordArg]);
        // All other fields
        const otherFields = model.fields.filter((f) => f !== isDynamic);
        const otherProps = otherFields
            .map((field) => {
                const zodAst = nangoTypeToZodAst(j, field, referencedModels || []);
                if (!zodAst) return undefined;
                return j.objectProperty(j.identifier(field.name), zodAst);
            })
            .filter((prop): prop is ReturnType<typeof j.objectProperty> => !!prop);
        const objectExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('object')), [j.objectExpression(otherProps)]);
        return j.callExpression(j.memberExpression(recordExpr, j.identifier('and')), [objectExpr]);
    }

    // regular object
    const properties = model.fields
        .map((field) => {
            const zodAst = nangoTypeToZodAst(j, field, referencedModels || []);
            if (!zodAst) return undefined;
            return j.objectProperty(j.identifier(field.name), zodAst);
        })
        .filter((prop): prop is ReturnType<typeof j.objectProperty> => !!prop);
    return j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('object')), [j.objectExpression(properties)]);
}

/**
 * Converts a NangoModelField type to Zod AST
 */
function nangoTypeToZodAst(
    j: typeof jscodeshift,
    field: NangoModelField,
    referencedModels?: string[]
): jscodeshift.CallExpression | jscodeshift.Identifier | undefined {
    // Handle union
    if (field.union && Array.isArray(field.value)) {
        const unionArgs = field.value.map((v) => nangoTypeToZodAst(j, v, referencedModels)).filter((arg): arg is jscodeshift.CallExpression => !!arg);
        let unionExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('union')), [j.arrayExpression(unionArgs)]);
        if (field.optional) {
            unionExpr = j.callExpression(j.memberExpression(unionExpr, j.identifier('optional')), []);
        }
        return unionExpr;
    }

    // Handle array
    if (field.array) {
        const elementType =
            nangoTypeToZodAst(j, { ...field, array: false, optional: false, union: false }, referencedModels) ??
            j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('any')), []);
        let arrExpr = j.callExpression(j.memberExpression(elementType, j.identifier('array')), []);
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
            case 'date':
            case 'any':
                baseExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier(field.value)), []);
                break;
            case 'null':
                baseExpr = j.callExpression(j.memberExpression(j.identifier('z'), j.identifier('nullable')), []);
                break;
            case 'undefined':
                return;
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
