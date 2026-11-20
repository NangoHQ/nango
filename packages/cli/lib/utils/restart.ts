import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { constants } from 'node:os';
import path from 'node:path';

import type { PackageJson } from 'type-fest';

/** Resolve the installed package again: an upgrade can replace a symlink's target. */
export async function restartCliAfterUpgrade({ locallyInstalled, version }: { locallyInstalled: boolean; version: string }): Promise<number> {
    const cwd = process.cwd();
    const packageJsonPath = locallyInstalled
        ? createRequire(path.join(cwd, 'package.json')).resolve('nango/package.json')
        : path.join(execFileSync('npm', ['root', '-g'], { cwd, encoding: 'utf8' }).trim(), 'nango', 'package.json');
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;
    if (manifest.version !== version || typeof manifest.bin !== 'object' || !manifest.bin?.['nango']) {
        throw new Error(`Could not resolve the Nango ${version} executable`);
    }
    const executable = path.resolve(path.dirname(packageJsonPath), manifest.bin['nango']);
    const child = spawn(process.execPath, [executable, ...process.argv.slice(2)], {
        cwd,
        stdio: 'inherit',
        env: { ...process.env, NANGO_CLI_UPGRADE_MODE: 'ignore' }
    });
    return await new Promise<number>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code, signal) => resolve(code ?? (signal ? 128 + constants.signals[signal] : 1)));
    });
}
