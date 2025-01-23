import fs from 'fs/promises';
import * as tsNode from 'ts-node';
import path from 'path';

import { getNangoRootPath, printDebug, slash } from '../../utils.js';
import { build } from 'tsup';
import { exists } from './files.js';

export interface ListedFile {
    inputPath: string;
    outputPath: string;
    baseName: string;
}

/**
 * Compile all scripts:
 * - create a dist
 * - type check "index.ts"
 * - read exports from "index.ts"
 * - tsup each script
 */
export async function compileScripts({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<boolean> {
    const distDir = path.join(fullPath, 'dist');

    if (!(await exists(distDir))) {
        if (debug) {
            printDebug(`Creating ${distDir} directory`);
        }
        await fs.mkdir(distDir);
    }

    const tsconfigRaw = await fs.readFile(path.join(getNangoRootPath(), 'tsconfig.dev.json'), 'utf8');
    const tsconfig = JSON.parse(tsconfigRaw) as { compilerOptions: Record<string, any> };
    const compiler = tsNode.create({
        skipProject: true, // when installed locally we don't want ts-node to pick up the package tsconfig.json file
        compilerOptions: tsconfig.compilerOptions
    });

    if (debug) {
        printDebug(`Compiler options: ${JSON.stringify(tsconfig.compilerOptions, null, 2)}`);
    }

    const indexTs = path.join(fullPath, 'index.ts');
    if (!(await exists(indexTs))) {
        console.error('No index.ts found');
        process.exit(1);
    }

    // Compile the index.ts just in case
    compiler.compile(await fs.readFile(indexTs, 'utf8'), indexTs);

    // Extract imports from the index file
    const listedFiles = await extractImports({ filePath: indexTs, fullPath });
    if (listedFiles.size === 0) {
        console.error('No imports found in index.ts.');
        process.exit(1);
    }

    console.log('Found', listedFiles.size, 'scripts to compile');

    for (const [, file] of listedFiles) {
        await compileOneFile({ fullPath, file, debug });
    }

    return true;
}

// Function to get all imports from a file
async function extractImports({ fullPath, filePath }: { fullPath: string; filePath: string }): Promise<Map<string, ListedFile>> {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const importRegex = /export\s+.*?['"](.*?)['"]/g;
    const imports = new Map<string, ListedFile>();
    let match;

    while ((match = importRegex.exec(fileContent)) !== null) {
        if (!match[1]) {
            break;
        }

        const resolved = resolveImportPath({ filePath: match[1], baseDir: fullPath });
        const baseName = path.basename(resolved, '.ts');
        const split = resolved.split('/');
        const integration = split[split.length - 3];
        const scriptType = split[split.length - 2];

        imports.set(resolved, {
            inputPath: resolved,
            outputPath: path.join(fullPath, 'dist', `${integration}/${scriptType}/${baseName}.cjs`),
            baseName
        });
    }

    return imports;
}

// Function to resolve relative and package imports to absolute paths
function resolveImportPath({ filePath, baseDir }: { filePath: string; baseDir: string }): string {
    // Check if it's a relative import
    if (filePath.startsWith('.') || filePath.startsWith('/')) {
        return path.resolve(baseDir, filePath + (filePath.endsWith('.ts') ? '' : '.ts'));
    }

    // For package imports, we return them as is
    return filePath;
}

async function compileOneFile({ fullPath, file, debug = false }: { fullPath: string; file: ListedFile; debug: boolean }): Promise<boolean | null> {
    if (debug) {
        printDebug(`Compiling ${file.inputPath} -> ${file.outputPath}`);
    }

    await build({
        entry: [slash(file.inputPath)],
        esbuildOptions(options) {
            options.outfile = slash(file.outputPath); // Override the output file path
            delete options.outdir;
        },
        tsconfig: path.join(getNangoRootPath(), 'tsconfig.dev.json'),
        skipNodeModulesBundle: true,
        silent: !debug,
        sourcemap: 'inline',
        outDir: file.outputPath,
        // eslint-disable-next-line @typescript-eslint/require-await
        onSuccess: async () => {
            console.log('Compiled', file.inputPath.replace(fullPath, '.'));
        }
    });

    return true;
}
