import fs from 'node:fs';
import path from 'node:path';

import * as babel from '@babel/core';
import chalk from 'chalk';
import { build } from 'esbuild';
import { glob } from 'glob';
import ora from 'ora';
import ts from 'typescript';

import { generateAdditionalExports } from '../services/model.service.js';
import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';
import { buildDefinitions } from './definitions.js';

import type { Result } from '@nangohq/types';

const npmPackageRegex = /^[^./\s]/; // Regex to identify npm packages (not starting with . or /)
const exportRegex = /export\s+\*\s+from\s+['"](\.\/[^'"]+)['"];/g;

const tsconfig: ts.CompilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ESNext,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
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
            return Err('failed_to_read_index_ts');
        }
        const indexContent = indexContentResult.value;

        // Get the entry points
        const entryPoints = getEntryPoints(indexContent);
        if (entryPoints.length === 0) {
            spinner.fail();
            console.error("No entry points found in index.ts (e.g., export * from './syncs/github/fetch.js'). Nothing to compile.");
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
                console.error(chalk.red(buildRes.error.message));
                return buildRes;
            }
        }

        spinner.text = `${text} - Post compilation`;
        printDebug('Post compilation', debug);
        await postCompile({ fullPath });
        spinner.text = text;
        spinner.succeed();

        // Build and export the definitions
        spinner = ora({ text: `Exporting definitions` }).start();
        const rebuild = await buildDefinitions({ fullPath, debug });
        if (rebuild.isErr()) {
            spinner.fail(`Failed to compile definitions`);
            console.log(chalk.red(rebuild.error.message));
            return Err(rebuild.error);
        }

        generateAdditionalExports({ parsed: rebuild.value, fullPath, debug });

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
async function readIndexContent(fullPath: string): Promise<Result<string>> {
    const indexTsPath = path.join(fullPath, 'index.ts');
    try {
        const indexContent = await fs.promises.readFile(indexTsPath, 'utf8');
        return Ok(indexContent);
    } catch (err) {
        console.error(`Could not read ${indexTsPath}`, err);
        return Err('failed_to_read_index_ts');
    }
}

/**
 * Extracts the entry points from the index.ts content.
 */
function getEntryPoints(indexContent: string): string[] {
    const entryPoints: string[] = [];
    let match;
    while ((match = exportRegex.exec(indexContent)) !== null) {
        if (!match[1]) {
            continue;
        }
        entryPoints.push(match[1].endsWith('.js') ? match[1] : `${match[1]}.js`);
    }
    return entryPoints;
}

/**
 * Runs the typescript compiler to typecheck the code.
 */
function typeCheck({ fullPath, entryPoints }: { fullPath: string; entryPoints: string[] }): Result<boolean> {
    const program = ts.createProgram({
        rootNames: entryPoints.map((file) => path.join(fullPath, file.replace('.js', '.ts'))),
        options: {
            ...tsconfig
        }
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length <= 0) {
        return Ok(true);
    }

    // On purpose
    console.log('');
    for (const diagnostic of diagnostics) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (diagnostic.file && diagnostic.start != null) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            const fileName = diagnostic.file.fileName.replace(`${fullPath}/`, '');
            console.error(chalk.red('err'), '-', `${chalk.blue(fileName)}${chalk.yellow(`:${line + 1}:${character + 1}`)}`, `\r\n  ${message}\r\n`);
        } else {
            console.error(message);
        }
    }

    console.error(`Found ${diagnostics.length} error${diagnostics.length > 1 ? 's' : ''}`);

    return Err('errors');
}

/**
 * Bundles the entry file using esbuild and returns the bundled code as a string (in memory).
 */
export async function bundleFile({ entryPoint }: { entryPoint: string }): Promise<Result<string>> {
    try {
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
                    name: 'remove-create-wrappers',
                    setup(build: any) {
                        build.onLoad({ filter: /\.ts$/ }, async (args: any) => {
                            const source = await fs.promises.readFile(args.path, 'utf8');
                            const result = await babel.transformAsync(source, {
                                filename: args.path,
                                plugins: [removeCreateWrappersBabelPlugin],
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
                compilerOptions: {
                    ...tsconfig,
                    importsNotUsedAsValues: 'remove',
                    jsx: 'react',
                    target: 'esnext'
                }
            }
        });
        if (res.errors.length > 0) {
            return Err('failed_to_build');
        }

        const output = res.outputFiles?.[0]?.text || '';
        return Ok(output);
    } catch (err) {
        if (err instanceof Error && err.message.includes('export')) {
            return Err('export');
        }
        console.error(chalk.red(err));
        return Err('failed_to_build_unknown');
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

    const bundleResult = await bundleFile({ entryPoint });
    if (bundleResult.isErr()) {
        return Err(bundleResult.error);
    }
    try {
        await fs.promises.writeFile(outfile, bundleResult.value, 'utf8');
    } catch (err) {
        console.error(chalk.red(err));
        return Err('failed_to_write_output');
    }
    return Ok(true);
}

/**
 * We need to replace the .js extension with .cjs in the imports.
 * This is because the code is compiled to .cjs and the imports are not automatically converted.
 */
async function postCompile({ fullPath }: { fullPath: string }) {
    const files = await glob(path.join(fullPath, 'build', '/**/*.cjs'));

    // Replace import with correct extension
    await Promise.all(
        files.map(async (file) => {
            let code = await fs.promises.readFile(file, 'utf8');

            // Rewrite .js to .cjs in import/require paths
            code = code.replace(/((?:import|require|from)\s*\(?['"])(\.\/[^'"]+)\.js(['"])/g, '$1$2.cjs$3');

            await fs.promises.writeFile(file, code);
        })
    );
}

export function tsToJsPath(filePath: string) {
    return filePath.replace(/^\.\//, '').replaceAll('/', '_').replaceAll('.js', '.cjs');
}

/**
 * This plugin is used to remove the create wrappers from the exports.
 *
 * Initially, I didn't want to remove this but because our codebase is ESM and node.vm only compiles CJS
 * it was annoying to have to compile the code twice. And have mixed code when publishing.
 * Since the wrapper is only used to stringly type the exports, we can remove it.
 */
function removeCreateWrappersBabelPlugin({ types: t }: { types: typeof babel.types }): babel.PluginObj<any> {
    const allowedExports = ['createAction', 'createSync', 'createOnEvent'];
    return {
        visitor: {
            ExportDefaultDeclaration(path) {
                if ((path.node as any).__transformedByRemoveCreateWrappers) {
                    return;
                }

                const decl = path.node.declaration;
                let calleeName = null;
                let arg = null;

                // Case 1: export default createAction({...})
                if (t.isCallExpression(decl) && t.isIdentifier(decl.callee) && allowedExports.includes(decl.callee.name)) {
                    let varName = '';
                    calleeName = decl.callee.name;
                    arg = decl.arguments[0];
                    if (!t.isObjectExpression(arg)) {
                        throw path.buildCodeFrameError(`Argument to ${calleeName} must be an object literal.`);
                    }

                    if (calleeName === 'createAction') varName = 'action';
                    if (calleeName === 'createSync') varName = 'sync';
                    if (calleeName === 'createOnEvent') varName = 'onEvent';

                    // Inject type property
                    arg.properties = [t.objectProperty(t.identifier('type'), t.stringLiteral(varName)), ...arg.properties];
                    const newValue = arg;
                    // Insert: export const <varName> = <newValue>;
                    const exportConst = t.exportNamedDeclaration(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(varName), newValue)]), []);
                    // Insert: export default <varName>;
                    const exportDefault = t.exportDefaultDeclaration(t.identifier(varName));
                    (exportConst as any).__transformedByRemoveCreateWrappers = true;
                    (exportDefault as any).__transformedByRemoveCreateWrappers = true;
                    path.replaceWithMultiple([exportConst, exportDefault]);
                }
                // Case 2: export default action; (or sync/onEvent)
                else if (t.isIdentifier(decl)) {
                    const binding = path.scope.getBinding(decl.name);
                    if (!binding || !binding.path.isVariableDeclarator()) {
                        throw path.buildCodeFrameError(`Invalid constant export`);
                    }
                    const init = binding.path.node.init;
                    if (!t.isCallExpression(init) || !t.isIdentifier(init.callee) || !allowedExports.includes(init.callee.name)) {
                        throw path.buildCodeFrameError(`Invalid function used in export`);
                    }

                    let varName = '';
                    calleeName = init.callee.name;
                    arg = init.arguments[0];
                    if (!t.isObjectExpression(arg)) {
                        throw path.buildCodeFrameError(`Argument to ${calleeName} must be an object literal.`);
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
                    throw path.buildCodeFrameError(`Unsupported export`);
                }
            }
        }
    };
}
