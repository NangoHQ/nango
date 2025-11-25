import fs, { existsSync, readFileSync } from 'fs';
import path from 'path';

import chalk from 'chalk';
import ora from 'ora';
import semver from 'semver';

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
            const userZodVersion = packageJson.devDependencies['zod'];
            const nangoZodVersion = examplePkg.devDependencies!['zod']!;

            if (!userZodVersion) {
                // No zod version installed, add it
                updated = true;
                packageJson.devDependencies['zod'] = nangoZodVersion;
            } else {
                // Check if the major version matches
                const userZodMajor = semver.major(semver.coerce(userZodVersion) || '0.0.0');
                const nangoZodMajor = semver.major(semver.coerce(nangoZodVersion) || '0.0.0');

                if (userZodMajor !== nangoZodMajor) {
                    // Different major version - force update
                    updated = true;
                    packageJson.devDependencies['zod'] = nangoZodVersion;
                } else if (userZodVersion !== nangoZodVersion) {
                    // Same major version, different minor/patch - warn but don't update
                    console.log(chalk.yellow(`⚠️  You are using zod version ${userZodVersion}, while Nango internally uses ${nangoZodVersion}.`));
                    console.log(
                        chalk.yellow(`   You may encounter compatibility issues. If you experience any problems, please update to ${nangoZodVersion}.`)
                    );
                }
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
