import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// npm publish runs with --ignore-scripts, and .npmrc sets ignore-scripts, so
// package lifecycle hooks do not run. Call this before publish instead.
const packageName = process.argv[2];

if (!packageName) {
    console.error('Usage: node scripts/prepare-publish-package.mjs <package-name>');
    process.exit(1);
}

const pkg = findWorkspacePackage(packageName);
if (!pkg) {
    console.error(`Could not find workspace package ${packageName}`);
    process.exit(1);
}

runIfPresent('copy:license');

if (packageName === '@nangohq/node') {
    run('build');
}

if (packageName === 'nango') {
    run('copy:files');
}

function findWorkspacePackage(name) {
    for (const dir of readdirSync('packages')) {
        const packageJsonPath = join('packages', dir, 'package.json');
        let content;
        try {
            content = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        } catch {
            continue;
        }
        if (content.name === name) {
            return content;
        }
    }
    return null;
}

function runIfPresent(scriptName) {
    if (!pkg.scripts?.[scriptName]) {
        return;
    }
    run(scriptName);
}

function run(scriptName) {
    console.log(`Running ${scriptName} for ${packageName}`);
    // npm is a .cmd shim on Windows, which execFile cannot launch without a shell.
    execFileSync('npm', ['run', '-w', packageName, scriptName], {
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });
}
