import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import { build } from 'esbuild';
import { glob } from 'glob';
import ora from 'ora';
import ts from 'typescript';

import { generateAdditionalExports } from '../services/model.service.js';
import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';
import { rebuildParsed } from './rebuild.js';

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

export async function compileAll({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<Result<boolean>> {
    const spinner = ora({ text: 'Typechecking' }).start();

    try {
        const indexTsPath = path.join(fullPath, 'index.ts');
        let indexContent;
        try {
            indexContent = await fs.promises.readFile(indexTsPath, 'utf8');
        } catch (err) {
            spinner.fail();
            console.error(`Could not read ${indexTsPath}`, err);
            return Err('failed_to_read_index_ts');
        }

        const entryPoints: string[] = [];
        let match;
        while ((match = exportRegex.exec(indexContent)) !== null) {
            if (!match[1]) {
                continue;
            }
            entryPoints.push(match[1].endsWith('.js') ? match[1] : `${match[1]}.js`);
        }

        if (entryPoints.length === 0) {
            spinner.fail();
            console.error("No entry points found in index.ts (e.g., export * from './syncs/github/fetch.js'). Nothing to compile.");
            return Err('no_file');
        }

        printDebug(`Found ${entryPoints.length} entry points in index.ts: ${entryPoints.join(', ')}`, debug);

        const typechecked = typeCheck({ fullPath, entryPoints });
        if (typechecked.isErr()) {
            spinner.fail();
            return typechecked;
        }

        spinner.text = `Building ${entryPoints.length} file(s)`;
        printDebug('Building', debug);
        for (const entryPoint of entryPoints) {
            const entryPointFullPath = path.join(fullPath, entryPoint);
            spinner.text = `Building ${entryPoint}`;
            printDebug(`Building ${entryPointFullPath}`, debug);

            const buildRes = await esbuild({ entryPoint: entryPointFullPath, projectRootPath: fullPath });
            if (buildRes.isErr()) {
                spinner.fail(`Failed to build ${entryPoint}`);
                return buildRes;
            }
        }

        spinner.text = 'Post compilation';
        printDebug('Post compilation', debug);
        await postCompile({ fullPath });

        const rebuild = await rebuildParsed({ fullPath, debug });
        if (rebuild.isErr()) {
            spinner.fail(`Failed to compile metadata`);
            return Err(rebuild.error);
        }

        generateAdditionalExports({ parsed: rebuild.value, fullPath, debug });
    } catch (err) {
        console.error(err);

        spinner.fail();
        return Err('failed_to_compile');
    }

    spinner.succeed('Compiled');
    return Ok(true);
}

function typeCheck({ fullPath, entryPoints }: { fullPath: string; entryPoints: string[] }): Result<boolean> {
    const program = ts.createProgram({
        rootNames: entryPoints.map((file) => file.replace('.js', '.ts')),
        options: {
            ...tsconfig
        }
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length <= 0) {
        return Ok(true);
    }

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

async function esbuild({ entryPoint, projectRootPath }: { entryPoint: string; projectRootPath: string }): Promise<Result<boolean>> {
    // Determine the relative path from the project root to the entry point's directory
    const relativeEntryPointDir = path.dirname(path.relative(projectRootPath, entryPoint));
    const outfileName = path.basename(entryPoint, '.js');
    const outfile = path.join(projectRootPath, 'build', relativeEntryPointDir, `${outfileName}.cjs`);

    // Ensure the output directory exists
    await fs.promises.mkdir(path.dirname(outfile), { recursive: true });

    const res = await build({
        entryPoints: [entryPoint],
        outfile: outfile,
        bundle: true, // Bundle the file
        sourcemap: true,
        format: 'cjs',
        target: 'esnext',
        platform: 'node',
        // outbase: projectRootPath, // Set outbase to project root for correct structure in build/
        // outdir: path.join(projectRootPath, 'build'), // Output to build directory, maintaining structure
        // outExtension: { '.js': '.cjs' }, // This is not needed when outfile is specified
        logLevel: 'error',
        plugins: [
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
                module: 'commonjs',
                target: 'esnext',
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
                forceConsistentCasingInFileNames: true,
                moduleResolution: 'node',
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
                checkJs: false
            }
        }
    });
    if (res.errors.length > 0) {
        // esbuild already prints errors to console with logLevel: 'error'
        return Err('failed_to_build');
    }

    return Ok(true);
}

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
