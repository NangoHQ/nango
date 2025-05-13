import { exec } from 'node:child_process';
import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import chalk from 'chalk';

import { printDebug } from '../utils.js';
import verificationService from './verification.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

/**
 * Init
 * If we're not currently in the nango-integrations directory create one
 */
export async function init({ absolutePath, debug = false }: { absolutePath: string; debug?: boolean }): Promise<boolean> {
    const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });

    printDebug(`Creating the nango integrations directory in ${absolutePath}`, debug);

    if (!stat) {
        printDebug(`Directory does not exist`, debug);

        await fs.promises.mkdir(absolutePath);
    } else if (!stat.isDirectory()) {
        console.log(chalk.red(`The path provided is not a directory. Exiting.`));
        return false;
    }

    const check = await verificationService.preCheck({ fullPath: absolutePath, debug });
    if (check.hasNangoYaml || check.isZeroYaml) {
        console.log(chalk.red(`The path provided is already a Nango integrations folder.`));
        return false;
    }

    const exampleFolderPath = path.join(__dirname, '..', '..', 'example');
    try {
        printDebug(`Copy example folder`, debug);

        await fs.promises.mkdir(absolutePath, { recursive: true });
        await copyRecursive(exampleFolderPath, absolutePath);
    } catch (err) {
        console.log(chalk.red(`Failed to copy template: ${err instanceof Error ? err.message : 'unknown error'}`));
        return false;
    }

    try {
        printDebug(`Running npm install`, debug);

        await execAsync('npm install', { cwd: absolutePath });
    } catch (err) {
        console.log(chalk.red(`Failed to npm install: ${err instanceof Error ? err.message : 'unknown error'}`));
        return false;
    }

    return true;
}

async function copyRecursive(src: string, dest: string) {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') {
                continue;
            }
            await fs.promises.mkdir(destPath, { recursive: true });
            await copyRecursive(srcPath, destPath);
        } else {
            await fs.promises.copyFile(srcPath, destPath);
        }
    }
}
