import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import chalk from 'chalk';
import ora from 'ora';

import { printDebug } from '../utils.js';
import { NANGO_VERSION } from '../version.js';
import { compileAll } from './compile.js';
import { exampleFolder } from './constants.js';

const execAsync = promisify(exec);

/**
 * Init a new nango folder
 */
export async function initZero({
    absolutePath,
    debug = false,
    onlyCopy = false
}: {
    absolutePath: string;
    debug?: boolean;
    onlyCopy?: boolean;
}): Promise<boolean> {
    printDebug(`Creating the nango integrations directory in ${absolutePath}`, debug);

    const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });

    // Create directory if it doesn't exist
    if (!stat) {
        printDebug(`Directory does not exist`, debug);

        await fs.promises.mkdir(absolutePath);
    } else if (!stat.isDirectory()) {
        console.log(chalk.red(`The path provided is not a directory. Exiting.`));
        return false;
    }

    // Copy example folder
    {
        const spinner = ora({ text: 'Copy example' }).start();
        try {
            printDebug(`Copy example folder`, debug);

            await fs.promises.mkdir(absolutePath, { recursive: true });
            await copyRecursive(exampleFolder, absolutePath);
            await fs.promises.rename(path.join(absolutePath, '.env.example'), path.join(absolutePath, '.env'));
            spinner.succeed();
        } catch (err) {
            spinner.fail();
            console.log(chalk.red(`Failed to copy template: ${err instanceof Error ? err.message : 'unknown error'}`));
            return false;
        }
    }

    // Update nango dependency version in package.json
    const packageJsonPath = path.join(absolutePath, 'package.json');
    try {
        const packageJsonRaw = await fs.promises.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonRaw) as { devDependencies: { nango: string } };
        packageJson.devDependencies.nango = NANGO_VERSION;
        await fs.promises.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
    } catch (err) {
        console.log(chalk.red(`Failed to update nango version in package.json: ${err instanceof Error ? err.message : 'unknown error'}`));
        return false;
    }

    // If onlyCopy is true, we don't need to run npm install or compile
    if (onlyCopy) {
        return true;
    }

    // Run npm install
    {
        const spinner = ora({ text: 'Install packages' }).start();
        try {
            printDebug(`Running npm install`, debug);

            await execAsync('npm install', { cwd: absolutePath });
            spinner.succeed();
        } catch (err) {
            spinner.fail();
            console.log(chalk.red(`Failed to npm install: ${err instanceof Error ? err.message : 'unknown error'}`));
            return false;
        }
    }

    {
        const res = await compileAll({ fullPath: absolutePath, debug });
        if (res.isErr()) {
            return false;
        }
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
