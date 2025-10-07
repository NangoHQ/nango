import fs from 'node:fs';
import path from 'node:path';

import * as babel from '@babel/core';
import chalk from 'chalk';
import { build } from 'esbuild';
import ora from 'ora';
import { serializeError } from 'serialize-error';
import ts from 'typescript';

import { generateAdditionalExports } from '../services/model.service.js';
import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';
import { allowedPackages, importRegex, npmPackageRegex, tsconfig, tsconfigString } from './constants.js';
import { buildDefinitions } from './definitions.js';
import { CompileError, ReadableError, badExportCompilerError, fileErrorToText, tsDiagnosticToText } from './utils.js';

// import type { BabelErrorType } from './constants.js';
import type { Result } from '@nangohq/types';

/**
 * This function is used to compile the code in the integration.
 *
 * It will:
 * - Typecheck the code
 * - Compile the code to .cjs
 * - Rebuild nango.yaml in memory
 */
export async function compileAll({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<Result<boolean>> {
    let spinner = ora({ text: 'Typechecking' }).start();

    try {
        // Read the index.ts content
        const indexContentResult = await readIndexContent(fullPath);
        if (indexContentResult.isErr()) {
            spinner.fail();
            console.error(chalk.red(`Could not read index.ts`));
            return Err('failed_to_read_index_ts');
        }
        const indexContent = indexContentResult.value;

        // Get the entry points
        const entryPoints = getEntryPoints(indexContent);
        if (entryPoints.length === 0) {
            spinner.fail();
            console.error(chalk.red("No entry points found in index.ts, add one like this `import './syncs/github/fetch.js'`"));
            return Err('no_file');
        }

        printDebug(`Found ${entryPoints.length} entry points in index.ts: ${entryPoints.join(', ')}`, debug);

        // Typecheck the code
        const typechecked = typeCheck({ fullPath, entryPoints });
        if (typechecked.isErr()) {
            spinner.fail();
            return typechecked;
        }

        spinner.succeed();

        // Build the entry points
        const text = `Building ${entryPoints.length} file(s)`;
        spinner = ora({ text }).start();
        printDebug('Building', debug);
        for (const entryPoint of entryPoints) {
            const entryPointFullPath = path.join(fullPath, entryPoint);
            spinner.text = `${text} - ${entryPoint}`;
            printDebug(`Building ${entryPointFullPath}`, debug);

            const buildRes = await compileOne({ entryPoint: entryPointFullPath, projectRootPath: fullPath });
            if (buildRes.isErr()) {
                spinner.fail(`Failed to build ${entryPoint}`);
                console.log('');
                console.error(buildRes.error instanceof CompileError ? buildRes.error.toText() : chalk.red(buildRes.error.message));
                return buildRes;
            }
        }

        spinner.text = `Building ${entryPoints.length} file(s)`;
        spinner.succeed();

        // Build and export the definitions
        spinner = ora({ text: `Exporting definitions` }).start();
        const def = await buildDefinitions({ fullPath, debug });
        if (def.isErr()) {
            spinner.fail(`Failed to compile definitions`);
            console.log('');
            console.log(def.error instanceof ReadableError ? def.error.toText() : chalk.red(def.error.message));
            return Err(def.error);
        }

        for (const integration of def.value.integrations) {
            for (const sync of integration.syncs) {
                if (sync.track_deletes) {
                    console.warn(
                        chalk.yellow(
                            `\nWarning: Sync '${sync.name}' for integration '${integration.providerConfigKey}' has 'track_deletes' enabled. This feature is deprecated and will be removed in future versions. Please call 'nango.deleteRecordsFromPreviousExecutions()' in your sync script to automatically detect deletions.`
                        )
                    );
                }
            }
        }

        generateAdditionalExports({ parsed: def.value, fullPath, debug });

        spinner.succeed();
    } catch (err) {
        console.error(err);

        spinner.fail();
        return Err('failed_to_compile');
    }

    spinner.succeed('Compiled');
    return Ok(true);
}

/**
 * Reads the content of index.ts in the given fullPath.
 */
export async function readIndexContent(fullPath: string): Promise<Result<string>> {
    const indexTsPath = path.join(fullPath, 'index.ts');
    try {
        const indexContent = await fs.promises.readFile(indexTsPath, 'utf8');
        return Ok(indexContent);
    } catch {
        return Err('failed_to_read_index_ts');
    }
}

/**
 * Extracts the entry points from the index.ts content.
 */
export function getEntryPoints(indexContent: string): string[] {
    const entryPoints: string[] = [];
    let match;
    while ((match = importRegex.exec(indexContent)) !== null) {
        const fp = match.groups?.['path'];
        if (!fp) {
            continue;
        }
        entryPoints.push(fp.endsWith('.js') ? fp : `${fp}.js`);
    }
    return entryPoints;
}

/**
 * Runs the typescript compiler to typecheck the code.
 */
function typeCheck({ fullPath, entryPoints }: { fullPath: string; entryPoints: string[] }): Result<boolean> {
    const program = ts.createProgram({
        rootNames: entryPoints.map((file) => path.join(fullPath, file.replace('.js', '.ts'))),
        options: tsconfig
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length <= 0) {
        return Ok(true);
    }

    // On purpose
    console.log('');
    const report = tsDiagnosticToText(fullPath);
    for (const diagnostic of diagnostics) {
        report(diagnostic);
    }

    console.error(`Found ${diagnostics.length} error${diagnostics.length > 1 ? 's' : ''}`);

    return Err('errors');
}

/**
 * Bundles the entry file using esbuild and returns the bundled code as a string (in memory).
 */
export async function bundleFile({ entryPoint, projectRootPath }: { entryPoint: string; projectRootPath: string }): Promise<Result<string>> {
    const friendlyPath = entryPoint.replace('.js', '.ts').replace(projectRootPath, '.');
    try {
        const { plugin, bag } = nangoPlugin({ entryPoint });
        const res = await build({
            entryPoints: [entryPoint],
            bundle: true,
            sourcemap: 'inline',
            format: 'cjs',
            target: 'esnext',
            platform: 'node',
            logLevel: 'silent',
            treeShaking: true,
            write: false, // Output in memory
            plugins: [
                {
                    name: 'nango-plugin',
                    setup(build: any) {
                        build.onLoad({ filter: /\.ts$/ }, async (args: any) => {
                            const source = await fs.promises.readFile(args.path, 'utf8');
                            const result = await babel.transformAsync(source, {
                                filename: args.path,
                                plugins: [plugin],
                                parserOpts: { sourceType: 'module', plugins: ['typescript'] },
                                generatorOpts: { decoratorsBeforeExport: true }
                            });
                            return { contents: result?.code ?? source, loader: 'ts' };
                        });
                    }
                },
                {
                    name: 'external-npm-packages',
                    setup(buildInstance) {
                        buildInstance.onResolve({ filter: npmPackageRegex }, (args) => {
                            if (!args.path.startsWith('.') && !path.isAbsolute(args.path)) {
                                return { path: args.path, external: true };
                            }
                            return null; // let esbuild handle other paths
                        });
                    }
                }
            ],
            tsconfigRaw: {
                compilerOptions: tsconfigString
            }
        });
        if (res.errors.length > 0) {
            return Err('failed_to_build');
        }

        if (
            bag.batchingRecordsLines.length > 0 &&
            bag.setMergingStrategyLines.length > 0 &&
            bag.setMergingStrategyLines.some((line) => line > Math.min(...bag.batchingRecordsLines))
        ) {
            return Err(
                fileErrorToText({
                    filePath: friendlyPath,
                    msg: `setMergingStrategy should be called before any batching records function`,
                    line: Math.min(...bag.setMergingStrategyLines)
                })
            );
        }
        if (
            bag.proxyLines.length > 0 &&
            bag.setMergingStrategyLines.length > 0 &&
            bag.setMergingStrategyLines.some((line) => line > Math.min(...bag.proxyLines))
        ) {
            return Err(
                fileErrorToText({
                    filePath: friendlyPath,
                    msg: `setMergingStrategy should be called before any proxy function`,
                    line: Math.min(...bag.setMergingStrategyLines)
                })
            );
        }
        if (bag.deleteRecordsFromPreviousExecutionsLines.length > 1) {
            return Err(
                fileErrorToText({
                    filePath: friendlyPath,
                    msg: `deleteRecordsFromPreviousExecutions should be called only once per sync`,
                    line: Math.max(...bag.deleteRecordsFromPreviousExecutionsLines)
                })
            );
        }
        if (
            bag.deleteRecordsFromPreviousExecutionsLines.length > 0 &&
            bag.batchingRecordsLines.length > 0 &&
            bag.batchingRecordsLines.some((line) => line > Math.min(...bag.deleteRecordsFromPreviousExecutionsLines))
        ) {
            return Err(
                fileErrorToText({
                    filePath: friendlyPath,
                    msg: `deleteRecordsFromPreviousExecutions should be called after any batching records function`,
                    line: Math.min(...bag.deleteRecordsFromPreviousExecutionsLines)
                })
            );
        }

        const output = res.outputFiles?.[0]?.text || '';
        return Ok(output);
    } catch (err) {
        if (err instanceof Error) {
            // Babel is wrapping our own custom error but I couldn't find a way to access the original error easily
            // So we serialize it and hope for the best
            const obj = serializeError(err) as Record<string, any>;
            if ('errors' in obj) {
                const custom = obj['errors'][0]['detail'];
                if (custom['type']) {
                    return Err(new CompileError(custom['type'], custom['lineNumber'], custom['customMessage'], friendlyPath));
                }
            }
        }

        return Err(new CompileError('failed_to_build_unknown', 0, err instanceof Error ? err.message : 'Unknown error', friendlyPath));
    }
}

/**
 * We use esbuild to compile the code to .cjs.
 * node.vm only supports CJS and we also bundle all imported files in the same file.
 */
export async function compileOne({ entryPoint, projectRootPath }: { entryPoint: string; projectRootPath: string }): Promise<Result<boolean>> {
    const rel = path.relative(projectRootPath, entryPoint);
    // File are compiled to build/integration-type-script-name.cjs
    // Because it's easier to manipulate the files and it's easier in S3
    const outfile = path.join(projectRootPath, 'build', tsToJsPath(rel));

    // Ensure the output directory exists
    await fs.promises.mkdir(path.dirname(outfile), { recursive: true });

    const bundleResult = await bundleFile({ entryPoint, projectRootPath });
    if (bundleResult.isErr()) {
        return Err(bundleResult.error);
    }

    if (bundleResult.value.includes('console.log')) {
        const relPath = path.relative(projectRootPath, entryPoint).replace('.js', '.ts');
        console.warn(
            chalk.yellow(
                `\nWarning: Script '${relPath}' contains console.log statements. These logs will not appear in the Nango dashboard. Use await nango.log() instead to see logs in the dashboard.`
            )
        );
    }

    try {
        await fs.promises.writeFile(outfile, bundleResult.value, 'utf8');
    } catch (err) {
        console.error(chalk.red(err));
        return Err('failed_to_write_output');
    }
    return Ok(true);
}

export function tsToJsPath(filePath: string) {
    return filePath.replace(/^\.\//, '').replaceAll(/[/\\]/g, '_').replace('.js', '.cjs');
}

type AugmentedExport = babel.types.ExportNamedDeclaration & { __transformedByRemoveCreateWrappers?: boolean };
type AugmentedExportDefault = babel.types.ExportDefaultDeclaration & { __transformedByRemoveCreateWrappers?: boolean };

/**
 * This plugin is used to remove the create wrappers from the exports.
 *
 * Initially, I didn't want to remove this but because our codebase is ESM and node.vm only compiles CJS
 * it was annoying to have to compile the code twice. And have mixed code when publishing.
 * Since the wrapper is only used to stringly type the exports, we can remove it.
 */
function nangoPlugin({ entryPoint }: { entryPoint: string }) {
    const proxyLines: number[] = [];
    const batchingRecordsLines: number[] = [];
    const setMergingStrategyLines: number[] = [];
    const deleteRecordsFromPreviousExecutionsLines: number[] = [];
    const bag = {
        proxyLines,
        batchingRecordsLines,
        setMergingStrategyLines,
        deleteRecordsFromPreviousExecutionsLines
    };

    const normalizedEntryPoint = path.resolve(entryPoint);
    // Get actual path even if entryPoint is a symlink
    const realEntryPoint = fs.realpathSync(normalizedEntryPoint.replace('.js', '.ts')).replace('.ts', '.js');

    const allowedExports = ['createAction', 'createSync', 'createOnEvent'];
    const needsAwait = [
        'batchSend',
        'batchSave',
        'batchDelete',
        'log',
        'getFieldMapping',
        'setFieldMapping',
        'getMetadata',
        'setMetadata',
        'proxy',
        'get',
        'post',
        'put',
        'patch',
        'delete',
        'getConnection',
        'getEnvironmentVariables',
        'triggerAction',
        'setMergingStrategy',
        'deleteRecordsFromPreviousExecutions'
    ];
    const callsProxy = ['proxy', 'get', 'post', 'put', 'patch', 'delete'];
    const callsBatchingRecords = ['batchSave', 'batchDelete', 'batchUpdate'];

    return {
        bag,
        plugin: ({ types: t }: { types: typeof babel.types }): babel.PluginObj<any> => {
            return {
                visitor: {
                    ImportDeclaration(path) {
                        const lineNumber = path.node.loc?.start.line || 0;
                        const source = path.node.source.value;
                        if (typeof source !== 'string') {
                            return;
                        }

                        // Allow relative path imports (./path or ../path)
                        if (source.startsWith('./') || source.startsWith('../')) {
                            return;
                        }

                        // Check if the imported package is in the allowed list
                        if (!allowedPackages.includes(source)) {
                            throw new CompileError(
                                'disallowed_import',
                                lineNumber,
                                `Import of package '${source}' is not allowed. Allowed packages are: ${allowedPackages.join(', ')}`
                            );
                        }
                    },

                    CallExpression(astPath) {
                        const lineNumber = astPath.node.loc?.start.line || 0;
                        const callee = astPath.node.callee;
                        if (!('object' in callee) || !('property' in callee)) {
                            return;
                        }
                        if (callee.object.type !== 'Identifier' || callee.object.name !== 'nango' || callee.property?.type !== 'Identifier') {
                            return;
                        }

                        const isAwaited = astPath.findParent((parentPath) => parentPath.isAwaitExpression());
                        const isThenOrCatch = astPath.findParent(
                            (parentPath) =>
                                t.isMemberExpression(parentPath.node) &&
                                (t.isIdentifier(parentPath.node.property, { name: 'then' }) || t.isIdentifier(parentPath.node.property, { name: 'catch' }))
                        );

                        const isReturned = Boolean(astPath.findParent((parentPath) => t.isReturnStatement(parentPath.node)));

                        if (!isAwaited && !isThenOrCatch && !isReturned && needsAwait.includes(callee.property.name)) {
                            throw new CompileError(
                                'method_need_await',
                                lineNumber,
                                `nango.${callee.property.name}() calls must be awaited in. Not awaiting can lead to unexpected results.`
                            );
                        }

                        const callArguments = astPath.node.arguments;
                        if (callArguments.length > 0 && t.isObjectExpression(callArguments[0])) {
                            let retriesPropertyFound = false;
                            let retryOnPropertyFound = false;
                            callArguments[0].properties.forEach((prop) => {
                                if (!t.isObjectProperty(prop)) {
                                    return;
                                }
                                if (t.isIdentifier(prop.key) && prop.key.name === 'retries') {
                                    retriesPropertyFound = true;
                                }
                                if (t.isIdentifier(prop.key) && prop.key.name === 'retryOn') {
                                    retryOnPropertyFound = true;
                                }
                            });

                            if (!retriesPropertyFound && retryOnPropertyFound) {
                                throw new CompileError('retryon_need_retries', lineNumber, `Proxy call: 'retryOn' should not be used if 'retries' is not set.`);
                            }
                        }

                        // Check the main file and only the exec method for common errors
                        // If you abstract those calls in functions then it's not checking since it's quite hard to determine order
                        const currentFilePath = (astPath.hub as any)?.file?.opts?.filename;
                        if (currentFilePath) {
                            const normalizedCurrentPath = path.resolve(currentFilePath.replace('.ts', '.js'));
                            if (normalizedCurrentPath === realEntryPoint) {
                                // Check if we're inside a createSync's exec function
                                const isInCreateSyncExec = astPath.findParent((parentPath) => {
                                    if (!parentPath.isObjectProperty()) {
                                        return false;
                                    }
                                    const prop = parentPath.node;
                                    return t.isIdentifier(prop.key) && prop.key.name === 'exec';
                                });

                                if (isInCreateSyncExec) {
                                    if (callsProxy.includes(callee.property.name)) {
                                        proxyLines.push(lineNumber);
                                    }
                                    if (callsBatchingRecords.includes(callee.property.name)) {
                                        batchingRecordsLines.push(lineNumber);
                                    }
                                    if (callee.property.name === 'setMergingStrategy') {
                                        setMergingStrategyLines.push(lineNumber);
                                    }

                                    if (callee.property.name === 'deleteRecordsFromPreviousExecutions') {
                                        deleteRecordsFromPreviousExecutionsLines.push(lineNumber);
                                    }
                                }
                            }
                        }
                    },

                    ExportNamedDeclaration(astPath) {
                        // Skip internally transformed exports
                        if ((astPath.node as AugmentedExport).__transformedByRemoveCreateWrappers) {
                            return;
                        }

                        // Skip processing if the current file is not an entry point
                        const currentFilePath = (astPath.hub as any)?.file?.opts?.filename;
                        if (currentFilePath) {
                            const normalizedCurrentPath = path.resolve(currentFilePath.replace('.ts', '.js'));
                            if (normalizedCurrentPath !== realEntryPoint) {
                                return;
                            }
                        }

                        const lineNumber = astPath.node.loc?.start.line || 0;
                        const node = astPath.node;

                        // Check if this is a re-export (export { something } from 'module')
                        if (node.source) {
                            return; // Allow re-exports
                        }

                        const namedExportError = (exportedName: string) => {
                            throw new CompileError(
                                'nango_named_export_not_allowed',
                                lineNumber,
                                `Named export '${exportedName}' is not allowed. Only export default and ${allowedExports.join(', ')} are permitted.`
                            );
                        };

                        // Check if any exported specifiers are not in allowedExports
                        if (node.specifiers) {
                            for (const specifier of node.specifiers) {
                                if (t.isExportSpecifier(specifier) && t.isIdentifier(specifier.exported)) {
                                    const exportedName = specifier.exported.name;
                                    if (!allowedExports.includes(exportedName)) {
                                        namedExportError(exportedName);
                                    }
                                }
                            }
                        }

                        // Check if this is a variable/function declaration export
                        if (node.declaration) {
                            const exportedNames: string[] = [];

                            if (t.isFunctionDeclaration(node.declaration) && node.declaration.id) {
                                exportedNames.push(node.declaration.id.name);
                            } else if (t.isVariableDeclaration(node.declaration)) {
                                for (const declarator of node.declaration.declarations) {
                                    if (t.isIdentifier(declarator.id)) {
                                        exportedNames.push(declarator.id.name);
                                    }
                                }
                            }

                            for (const exportedName of exportedNames) {
                                if (!allowedExports.includes(exportedName)) {
                                    namedExportError(exportedName);
                                }
                            }
                        }
                    },

                    ExportDefaultDeclaration(astPath) {
                        if ((astPath.node as AugmentedExportDefault).__transformedByRemoveCreateWrappers) {
                            return;
                        }

                        // Skip processing if the current file is not an entry point
                        const currentFilePath = (astPath.hub as any)?.file?.opts?.filename;
                        if (currentFilePath) {
                            const normalizedCurrentPath = path.resolve(currentFilePath.replace('.ts', '.js'));
                            if (normalizedCurrentPath !== realEntryPoint) {
                                return;
                            }
                        }

                        const lineNumber = astPath.node.loc?.start.line || 0;
                        const decl = astPath.node.declaration;
                        let calleeName = null;
                        let arg = null;

                        // Case 1: export default createAction({...})
                        if (t.isCallExpression(decl) && t.isIdentifier(decl.callee) && allowedExports.includes(decl.callee.name)) {
                            let varName = '';
                            calleeName = decl.callee.name;
                            arg = decl.arguments[0];
                            if (!t.isObjectExpression(arg)) {
                                throw new CompileError('nango_invalid_function_param', lineNumber, 'Invalid function parameter, should be an object');
                            }

                            if (calleeName === 'createAction') varName = 'action';
                            if (calleeName === 'createSync') varName = 'sync';
                            if (calleeName === 'createOnEvent') varName = 'onEvent';

                            // Inject type property
                            arg.properties = [t.objectProperty(t.identifier('type'), t.stringLiteral(varName)), ...arg.properties];
                            const newValue = arg;
                            // Insert: export const <varName> = <newValue>;
                            const exportConst = t.exportNamedDeclaration(
                                t.variableDeclaration('const', [t.variableDeclarator(t.identifier(varName), newValue)]),
                                []
                            );
                            // Insert: export default <varName>;
                            const exportDefault = t.exportDefaultDeclaration(t.identifier(varName));
                            (exportConst as AugmentedExport).__transformedByRemoveCreateWrappers = true;
                            (exportDefault as AugmentedExportDefault).__transformedByRemoveCreateWrappers = true;
                            astPath.replaceWithMultiple([exportConst, exportDefault]);
                        }
                        // Case 2: export default action; (or sync/onEvent)
                        else if (t.isIdentifier(decl)) {
                            const binding = astPath.scope.getBinding(decl.name);
                            if (!binding || !binding.path.isVariableDeclarator()) {
                                throw new CompileError('nango_invalid_default_export', lineNumber, badExportCompilerError);
                            }

                            const init = binding.path.node.init;
                            if (!t.isCallExpression(init) || !t.isIdentifier(init.callee) || !allowedExports.includes(init.callee.name)) {
                                throw new CompileError('nango_invalid_default_export', lineNumber, badExportCompilerError);
                            }

                            let varName = '';
                            calleeName = init.callee.name;
                            arg = init.arguments[0];
                            if (!t.isObjectExpression(arg)) {
                                throw new CompileError('nango_invalid_function_param', lineNumber, 'Invalid function parameter, should be an object');
                            }

                            if (calleeName === 'createAction') varName = 'action';
                            if (calleeName === 'createSync') varName = 'sync';
                            if (calleeName === 'createOnEvent') varName = 'onEvent';
                            // Inject type property (mutate the object literal)
                            arg.properties = [t.objectProperty(t.identifier('type'), t.stringLiteral(varName)), ...arg.properties];
                            // Replace the variable's initializer with the object literal
                            binding.path.get('init').replaceWith(arg);
                            return;
                        } else {
                            throw new CompileError('nango_unsupported_export', lineNumber, badExportCompilerError);
                        }
                    }
                }
            };
        }
    };
}
