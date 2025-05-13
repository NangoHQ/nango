import chalk from 'chalk';
import { build } from 'esbuild';
import { glob } from 'glob';
import ts from 'typescript';

import { Err, Ok } from '../../utils/result.js';

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

    diagnostics.forEach((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        if (diagnostic.file && diagnostic.start != null) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            const fileName = diagnostic.file.fileName;
            console.error(chalk.red('err'), '-', `${chalk.blue(fileName)} ${chalk.yellow(`:${line + 1}:${character + 1}`)}`, `\r\n  ${message}\r\n`);
        } else {
            console.error(message);
        }
    });

    console.error(`Found ${diagnostics.length} error${diagnostics.length > 1 ? 's' : ''}`);
    return Err('errors');
}

export async function compileAll({ fullPath }: { fullPath: string }): Promise<Result<boolean>> {
    try {
        const entryPoints = await glob('**/*.ts', { cwd: fullPath, ignore: ['node_modules/**', 'dist/**', 'build/**'] });

        const typechecked = typeCheck({ entryPoints });
        if (typechecked.isErr()) {
            return typechecked;
        }

        await build({
            entryPoints: entryPoints,
            outdir: 'build',
            bundle: false,
            sourcemap: true,
            format: 'cjs',
            target: 'esnext',
            platform: 'node',
            outbase: '.',
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
            },
            logLevel: 'info'
        });
        return Ok(true);
    } catch (err) {
        console.error(err);
        return Err('failed_to_compile');
    }
}
