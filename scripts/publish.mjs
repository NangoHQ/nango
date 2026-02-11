#!/usr/bin/env zx
import figures from 'figures';
import { $, chalk, echo, fs, glob, minimist, spinner } from 'zx';

// npx zx ./publish.mjs --version=0.0.1
const argv = minimist(process.argv.slice(2));
const nextVersion = argv.version;
const skipCli = argv['skip-cli'] === true;
const dryRun = argv['dry-run'] === true;
const publishedPackageNames = new Set([
    '@nangohq/types',
    '@nangohq/nango-yaml',
    '@nangohq/providers',
    '@nangohq/node',
    '@nangohq/runner-sdk',
    '@nangohq/frontend',
    'nango'
]);
const lockfileDependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

if (!nextVersion) {
    echo`${chalk.red(`Please specify a version: "node publish.mjs 0.0.1"`)}`;
    process.exit(1);
}

echo`Publishing ${chalk.blue(nextVersion)}`;
echo``;

const versionRegex = /([0-9]+\.[0-9]+\.[0-9]+|0\.0\.1-[0-9a-fA-F]{40})/;
// ensure version is of format x.y.z or 0.0.1-<commit hash>
if (!nextVersion.match(versionRegex)) {
    echo`${chalk.red(`Invalid ${nextVersion} is not of format x.y.z or 0.0.1-<commit hash>`)}`;
    process.exit(1);
}

// Append version to file because it's easier to get the version
await bumpVersionTs();

// Rebuild with modified version.ts
await tsBuild();

// ---- Publish
await bumpWorkspacePackageVersion('@nangohq/types');
await npmPublish('@nangohq/types');
await bumpReference('@nangohq/types');

await bumpWorkspacePackageVersion('@nangohq/nango-yaml');
await npmPublish('@nangohq/nango-yaml');
await bumpReference('@nangohq/nango-yaml');

await bumpWorkspacePackageVersion('@nangohq/providers');
await npmPublish('@nangohq/providers');
await bumpReference('@nangohq/providers');

await bumpWorkspacePackageVersion('@nangohq/node');
await npmPublish('@nangohq/node');
await bumpReference('@nangohq/node');

await bumpWorkspacePackageVersion('@nangohq/runner-sdk');
await npmPublish('@nangohq/runner-sdk');
await bumpReference('@nangohq/runner-sdk');

// TODO: to delete maybe, seems unnecessary
await bumpWorkspacePackageVersion('@nangohq/frontend');
await npmPublish('@nangohq/frontend');
await bumpReference('@nangohq/frontend');

if (!skipCli) {
    await bumpWorkspacePackageVersion('nango');
    await npmPublish('nango');
}
// ---- /Publish

await bumpRootVersion();

echo``;
await bumpLockfileVersions();
echo(chalk.green(`${figures.tick} package-lock.json`));
echo(chalk.grey('done'));

// Output for post deploy debug
echo``;
echo``;
echo`- git diff`;
const res = await $`git diff`;
echo(res.stdout);

async function tsBuild() {
    await spinner('npm run ts-build', async () => {
        await $`npm run ts-build`;
    });
    echo(chalk.green(`${figures.tick} npm run ts-build`));
}

async function bumpVersionTs() {
    echo`Bumping version.ts..`;
    const versionFiles = await glob('packages/*/lib/version.ts');
    for (const file of versionFiles) {
        const content = (await fs.readFile(file)).toString();
        await fs.writeFile(file, content.replace(versionRegex, nextVersion));
        echo(chalk.grey(`  ${figures.tick} Bumped ${nextVersion} in ${file}`));
    }
}

async function npmPublish(packageName) {
    await spinner(`Publishing ${packageName}...`, async () => {
        const res = await $({ quiet: true, nothrow: true })`npm view "${packageName}@${nextVersion}"`;
        const hasError = res.stderr.includes('npm error code');
        const hasNotBeenPublished = res.stderr.includes('npm error code E404');
        if (!hasError && !hasNotBeenPublished) {
            echo(chalk.blue(`${figures.tick} Not published ${packageName} (already exists)`));
            return;
        }

        if (hasError && !hasNotBeenPublished) {
            echo``;
            echo`${chalk.red(`An error occurred`)}`;
            console.log(res);
            echo`${res.stderr}`;
            process.exit(1);
        }

        if (dryRun) {
            echo(chalk.yellow(`${figures.tick} Dry run, skipping publish ${packageName}`));
            return;
        }

        await $`npm publish --access public --provenance -w "${packageName}"`;

        echo(chalk.green(`${figures.tick} Published ${packageName}      `));
    });
}

// --- Version bump functions ---
// We intentionally avoid `npm install` and `npm version` here and use direct JSON file manipulation instead.
// npm install on Linux CI strips platform-specific optional dependencies (e.g. lightningcss-darwin-arm64)
// from package-lock.json due to a long-standing npm bug (https://github.com/npm/cli/issues/4828).
// A fix shipped in npm 11.3.0 but does not fully resolve the issue, we still see it on npm 11.5.1.
// By never letting npm touch the lockfile during publish, we preserve all platform entries.
async function bumpWorkspacePackageVersion(packageName) {
    const packagesJson = await glob('packages/*/package.json');
    for (const packageJson of packagesJson) {
        let content;
        try {
            content = JSON.parse((await fs.readFile(packageJson)).toString());
        } catch (err) {
            echo`${chalk.red(`Failed to parse ${packageJson}: ${err.message}`)}`;
            process.exit(1);
        }
        if (content.name !== packageName) {
            continue;
        }

        if (content.version !== nextVersion) {
            content.version = nextVersion;
            await fs.writeFile(packageJson, `${JSON.stringify(content, null, 4)}\n`);
            echo(chalk.grey(`  ${figures.tick} Bumped ${packageName} version in ${packageJson}`));
        }
        return;
    }

    echo`${chalk.red(`Could not find workspace package ${packageName}`)}`;
    process.exit(1);
}

async function bumpRootVersion() {
    const rootPackageJson = 'package.json';
    let content;
    try {
        content = JSON.parse((await fs.readFile(rootPackageJson)).toString());
    } catch (err) {
        echo`${chalk.red(`Failed to parse ${rootPackageJson}: ${err.message}`)}`;
        process.exit(1);
    }
    if (content.version !== nextVersion) {
        content.version = nextVersion;
        await fs.writeFile(rootPackageJson, `${JSON.stringify(content, null, 4)}\n`);
        echo(chalk.grey(`  ${figures.tick} Bumped root package version in ${rootPackageJson}`));
    }
}

async function bumpReference(packageName) {
    const packagesJson = await glob('packages/*/package.json');
    for (const packageJson of packagesJson) {
        const fp = packageJson;
        const content = (await fs.readFile(fp)).toString();
        const matchReg = new RegExp(`${packageName}": "[0-9]+.[0-9]+.[0-9]+"`);
        if (!matchReg.test(content)) {
            continue;
        }

        await fs.writeFile(fp, content.replace(matchReg, `${packageName}": "${nextVersion}"`));
        echo(chalk.grey(`  ${figures.tick} Bumped ${packageName} to ${nextVersion} in ${fp}`));
    }
}

async function bumpLockfileVersions() {
    await spinner('update package-lock versions', async () => {
        const lockfilePath = 'package-lock.json';
        let lock;
        try {
            lock = JSON.parse((await fs.readFile(lockfilePath)).toString());
        } catch (err) {
            echo`${chalk.red(`Failed to parse ${lockfilePath}: ${err.message}`)}`;
            process.exit(1);
        }

        if (lock.version) {
            lock.version = nextVersion;
        }
        if (lock.packages?.['']?.version) {
            lock.packages[''].version = nextVersion;
        }

        for (const [, packageMetadata] of Object.entries(lock.packages ?? {})) {
            if (!packageMetadata || typeof packageMetadata !== 'object') {
                continue;
            }

            if (
                typeof packageMetadata.name === 'string' &&
                typeof packageMetadata.version === 'string' &&
                publishedPackageNames.has(packageMetadata.name) &&
                versionRegex.test(packageMetadata.version)
            ) {
                packageMetadata.version = nextVersion;
            }

            for (const field of lockfileDependencyFields) {
                const dependencies = packageMetadata[field];
                if (!dependencies || typeof dependencies !== 'object') {
                    continue;
                }

                for (const dependencyName of publishedPackageNames) {
                    const currentValue = dependencies[dependencyName];
                    if (typeof currentValue === 'string' && versionRegex.test(currentValue)) {
                        dependencies[dependencyName] = nextVersion;
                    }
                }
            }
        }

        await fs.writeFile(lockfilePath, `${JSON.stringify(lock, null, 4)}\n`);
    });
}
