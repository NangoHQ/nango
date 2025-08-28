import fs, { existsSync, readFileSync } from 'fs';
import path from 'path';

import chalk from 'chalk';
import ora from 'ora';

import { exampleFolder } from './constants.js';
import { runPackageManagerInstall } from '../migrations/toZeroYaml.js';
import { Err, Ok } from '../utils/result.js';
import { printDebug } from '../utils.js';
import { NANGO_VERSION } from '../version.js';

import type { Result } from '@nangohq/types';
import type { PackageJson } from 'type-fest';

export async function checkAndSyncPackageJson({ fullPath, debug }: { fullPath: string; debug: boolean }): Promise<Result<{ updated: boolean }>> {
    printDebug('Checking and syncing package.json', debug);

    let updated = false;
    let newPkg: PackageJson | undefined;
    const packageJsonPath = path.join(fullPath, 'package.json');
    try {
        const examplePackageJsonPath = path.join(exampleFolder, 'package.json');
        const examplePkgRaw = await fs.promises.readFile(examplePackageJsonPath, 'utf-8');
        const examplePkg = JSON.parse(examplePkgRaw) as PackageJson;

        if (!existsSync(packageJsonPath)) {
            updated = true;
            newPkg = examplePkg;
        } else {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as PackageJson;
            if (!packageJson.devDependencies) {
                packageJson.devDependencies = {};
                updated = true;
            }
            if (!packageJson.devDependencies['zod'] || packageJson.devDependencies['zod'] !== examplePkg.devDependencies!['zod']!) {
                updated = true;
                packageJson.devDependencies['zod'] = examplePkg.devDependencies!['zod']!;
            }
            if (!packageJson.devDependencies['nango'] || packageJson.devDependencies['nango'] !== NANGO_VERSION) {
                updated = true;
                packageJson.devDependencies['nango'] = NANGO_VERSION;
            }
            newPkg = packageJson;
        }
    } catch (err) {
        return Err(new Error(`Error checking package.json`, { cause: err }));
    }

    if (updated && newPkg) {
        console.log(chalk.yellow('Your dependencies are out of date. Updating...'));
        const spinner = ora({ text: 'Updating package.json' }).start();
        await fs.promises.writeFile(packageJsonPath, JSON.stringify(newPkg, null, 2));
        await runPackageManagerInstall(fullPath);
        spinner.succeed();
    } else {
        printDebug('Package.json is up to date', debug);
    }

    return Ok({ updated });
}
