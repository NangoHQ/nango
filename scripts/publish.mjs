#!/usr/bin/env zx
import { $, echo, chalk, glob, spinner, fs, minimist } from 'zx';
import figures from 'figures';

// npx zx ./publish.mjs --version=0.0.1
const argv = minimist(process.argv.slice(2));
const nextVersion = argv.version;
const skipCli = argv['skip-cli'] === true;
const dryRun = argv['dry-run'] === true;

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
await npmPublish('@nangohq/types');
await bumpReference('@nangohq/types');
await npmInstall();

await npmPublish('@nangohq/nango-yaml');
await bumpReference('@nangohq/nango-yaml');
await npmInstall();

await npmPublish('@nangohq/providers');
await bumpReference('@nangohq/providers');
await npmInstall();

await npmPublish('@nangohq/node');
await bumpReference('@nangohq/node');
await npmInstall();

await npmPublish('@nangohq/runner-sdk');
await bumpReference('@nangohq/runner-sdk');
await npmInstall();

// TODO: to delete maybe, seems unnecessary
await npmPublish('@nangohq/frontend');
await bumpReference('@nangohq/frontend');
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

        await $`npm version ${nextVersion} -w "${packageName}"`;
        if (!dryRun) {
            await $`npm publish --access public -w "${packageName}"`;
        }

        echo(chalk.green(`${figures.tick} Published ${packageName}      `));
    });
}

async function bumpReference(packageName) {
    const packagesJson = await glob('packages/*/package.json');
    // We don't use npm install, because it behaves incoherently with workspaces and different terminals
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

async function npmInstall() {
    await spinner('npm install', async () => {
        await $`npm i`;
    });
}
