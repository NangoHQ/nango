import fs from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import { build } from 'esbuild';
import { glob } from 'glob';
import ora from 'ora';
import ts from 'typescript';

import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';

import type { Result } from '@nangohq/types';

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
        const entryPoints = await glob('**/*.ts', { cwd: fullPath, ignore: ['node_modules/**', 'dist/**', 'build/**'] });

        printDebug(`Found ${entryPoints.length} files`, debug);

        const typechecked = typeCheck({ entryPoints });
        if (typechecked.isErr()) {
            return typechecked;
        }

        spinner.text = 'Building';
        printDebug('Building', debug);
        await esbuild({ entryPoints });

        spinner.text = 'Post compilation';
        printDebug('Post compilation', debug);
        await postCompile({ fullPath });
    } catch (err) {
        console.error(err);

        spinner.fail('Failed to compile');
        return Err('failed_to_compile');
    }

    spinner.succeed('Compiled');
    return Ok(true);
}

function typeCheck({ entryPoints }: { entryPoints: string[] }): Result<boolean> {
    const program = ts.createProgram({
        rootNames: entryPoints,
        options: {
            ...tsconfig
        }
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length <= 0) {
        return Ok(true);
    }

    for (const diagnostic of diagnostics) {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (diagnostic.file && diagnostic.start != null) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            const fileName = diagnostic.file.fileName;
            console.error(chalk.red('err'), '-', `${chalk.blue(fileName)} ${chalk.yellow(`:${line + 1}:${character + 1}`)}`, `\r\n  ${message}\r\n`);
        } else {
            console.error(message);
        }
    }

    console.error(`Found ${diagnostics.length} error${diagnostics.length > 1 ? 's' : ''}`);

    return Err('errors');
}

async function esbuild({ entryPoints }: { entryPoints: string[] }) {
    await build({
        entryPoints: entryPoints,
        outdir: 'build',
        bundle: false,
        sourcemap: true,
        format: 'cjs',
        target: 'esnext',
        platform: 'node',
        outbase: '.',
        outExtension: { '.js': '.cjs' },
        logLevel: 'error',
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
}

async function postCompile({ fullPath }: { fullPath: string }) {
    const files = await glob(path.join(fullPath, 'build', '/**/*.cjs'));

    await Promise.all(
        files.map(async (file) => {
            let code = await fs.promises.readFile(file, 'utf8');

            // Rewrite .js to .cjs in import/require paths
            code = code.replace(/((?:import|require|from)\s*\(?['"])(\.\/[^'"]+)\.js(['"])/g, '$1$2.cjs$3');

            await fs.promises.writeFile(file, code);
        })
    );
}
