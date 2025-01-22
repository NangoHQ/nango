import fs from 'fs';
import * as tsNode from 'ts-node';
import path from 'path';

import { getNangoRootPath, printDebug } from '../utils.js';

export async function compileScripts({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<boolean> {
    const distDir = path.join(fullPath, 'dist');
    if (!fs.existsSync(distDir)) {
        if (debug) {
            printDebug(`Creating ${distDir} directory`);
        }
        fs.mkdirSync(distDir);
    }

    const tsconfigRaw = fs.readFileSync(path.join(getNangoRootPath(), 'tsconfig.dev.json'), 'utf8');
    const tsconfig = JSON.parse(tsconfigRaw) as { compilerOptions: Record<string, any> };
    const compiler = tsNode.create({
        skipProject: true, // when installed locally we don't want ts-node to pick up the package tsconfig.json file
        compilerOptions: tsconfig.compilerOptions
    });

    if (debug) {
        printDebug(`Compiler options: ${JSON.stringify(tsconfig.compilerOptions, null, 2)}`);
    }

    const indexTs = path.join(fullPath, 'index.ts');

    compiler.compile(await fs.promises.readFile(indexTs, 'utf8'), indexTs);

    return true;
}
