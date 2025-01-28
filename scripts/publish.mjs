#!/usr/bin/env zx
import { $, echo, chalk, glob, spinner, fs, path, minimist } from 'zx';
import figures from 'figures';

// npx zx ./publish.mjs --version=0.0.1
const argv = minimist(process.argv.slice(2));
const nextVersion = argv.version;
const skipCli = argv['skip-cli'] === true;

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

const here = import.meta.dirname;

// Append version to file because it's easier to get the version
await modifyVersionTs();

// Rebuild with modified version.ts
await tsBuild();

// ---- Publish
await npmPublish('@nangohq/types');
await bumpPackageFor('@nangohq/types', ['cli', 'frontend', 'nango-yaml', 'node-client', 'runner-sdk', 'providers']);
await npmInstall();

await npmPublish('@nangohq/nango-yaml');
await bumpPackageFor('@nangohq/nango-yaml', ['cli']);
await npmInstall();

await npmPublish('@nangohq/providers');
await bumpPackageFor('@nangohq/providers', ['runner-sdk']);
await npmInstall();

await npmPublish('@nangohq/node');
await bumpPackageFor('@nangohq/node', ['cli', 'runner-sdk']);
await npmInstall();

await npmPublish('@nangohq/runner-sdk');
await bumpPackageFor('@nangohq/runner-sdk', ['cli']);
await npmInstall();

// TODO: to delete maybe, seems unnecessary
await npmPublish('@nangohq/frontend');
await bumpPackageFor('webapp', ['frontend']);
await npmInstall();

if (!skipCli) {
    await npmPublish('nango');
    await npmInstall();
}
// ---- /Publish

await $`npm version "${nextVersion}" --no-git-tag-version --allow-same-version`;

echo``;
await npmInstall();
echo(chalk.green(`${figures.tick} npm install`));
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

async function modifyVersionTs() {
    await spinner('Modifying version.ts..', async () => {
        const versionFiles = await glob('packages/*/lib/version.ts');
        for (const file of versionFiles) {
            const content = (await fs.readFile(file)).toString();
            await fs.writeFile(file, content.replace(versionRegex, nextVersion));
        }
    });
    echo(chalk.green(`${figures.tick} Modifying version.ts`));
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

        await $`npm version ${nextVersion} -w "${packageName}"`;
        await $`npm publish --access public -w "${packageName}"`;

        echo(chalk.green(`${figures.tick} Published ${packageName}      `));
    });
}

async function bumpPackageFor(packageName, folders) {
    // We don't use npm install, because it behaves incoherently with workspaces and different terminals
    for (const folder of folders) {
        const fp = path.join(here, '..', 'packages', folder, 'package.json');
        const content = (await fs.readFile(fp)).toString();
        await fs.writeFile(fp, content.replace(new RegExp(`${packageName}": ".*"`), `${packageName}": "${nextVersion}"`));
        echo(chalk.grey(`  ${figures.tick} Bumped ${packageName} to ${nextVersion} in ${fp}`));
    }
}

async function npmInstall() {
    await spinner('npm install', async () => {
        await $`npm i`;
    });
}
