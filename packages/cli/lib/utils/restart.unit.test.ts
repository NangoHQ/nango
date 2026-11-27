import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { restartCliAfterUpgrade } from './restart.js';

vi.mock('node:child_process', async (importOriginal) => ({ ...(await importOriginal<typeof childProcess>()), execFileSync: vi.fn() }));

describe('restartCliAfterUpgrade', () => {
    let directory: string;
    const argv = process.argv;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nango-restart-'));
        vi.spyOn(process, 'cwd').mockReturnValue(directory);
        process.argv = [process.execPath, '/old/nango/dist/index.js', 'init', 'project with spaces', '--no-telemetry'];
    });

    afterEach(() => {
        process.argv = argv;
        vi.restoreAllMocks();
        fs.rmSync(directory, { recursive: true, force: true });
    });

    function installFixture(root: string, version = '0.72.4', exitCode = 0) {
        const packagePath = path.join(root, 'nango');
        fs.mkdirSync(packagePath, { recursive: true });
        fs.writeFileSync(path.join(packagePath, 'package.json'), JSON.stringify({ version, bin: { nango: './cli.cjs' } }));
        fs.writeFileSync(
            path.join(packagePath, 'cli.cjs'),
            `require('fs').writeFileSync('result.json', JSON.stringify({version: require('./package.json').version, args: process.argv.slice(2), cwd: process.cwd(), upgradeMode: process.env.NANGO_CLI_UPGRADE_MODE, inherited: process.env.NANGO_RESTART_TEST})); process.exit(${exitCode});`
        );
        return packagePath;
    }

    it('runs init with the upgraded local package, preserving arguments, cwd and environment', async () => {
        installFixture(path.join(directory, 'node_modules'));
        vi.stubEnv('NANGO_RESTART_TEST', 'preserved');
        try {
            expect(await restartCliAfterUpgrade({ locallyInstalled: true, version: '0.72.4' })).toBe(0);
            expect(JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'))).toEqual({
                version: '0.72.4',
                args: ['init', 'project with spaces', '--no-telemetry'],
                cwd: fs.realpathSync(directory),
                upgradeMode: 'ignore',
                inherited: 'preserved'
            });
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it('resolves a new symlink target instead of the old process executable', async () => {
        const installed = installFixture(path.join(directory, 'store', 'new-version'));
        fs.mkdirSync(path.join(directory, 'node_modules'));
        fs.symlinkSync(installed, path.join(directory, 'node_modules', 'nango'));
        expect(await restartCliAfterUpgrade({ locallyInstalled: true, version: '0.72.4' })).toBe(0);
    });

    it('uses the npm global installation and returns the child failure status', async () => {
        const root = path.join(directory, 'global');
        installFixture(root, '0.72.4', 17);
        vi.mocked(childProcess.execFileSync).mockReturnValue(`${root}\n`);
        expect(await restartCliAfterUpgrade({ locallyInstalled: false, version: '0.72.4' })).toBe(17);
        expect(childProcess.execFileSync).toHaveBeenCalledWith('npm', ['root', '-g'], { cwd: directory, encoding: 'utf8' });
    });

    it('preserves compile arguments when launching the upgraded CLI', async () => {
        installFixture(path.join(directory, 'node_modules'));
        process.argv = [process.execPath, '/old/nango/dist/index.js', 'compile', '--debug'];
        expect(await restartCliAfterUpgrade({ locallyInstalled: true, version: '0.72.4' })).toBe(0);
        expect(JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'))).toMatchObject({
            version: '0.72.4',
            args: ['compile', '--debug'],
            upgradeMode: 'ignore'
        });
    });

    it('refuses to rerun an installation that still has the old version', async () => {
        installFixture(path.join(directory, 'node_modules'), '0.71.13');
        await expect(restartCliAfterUpgrade({ locallyInstalled: true, version: '0.72.4' })).rejects.toThrow('Could not resolve');
        expect(fs.existsSync(path.join(directory, 'result.json'))).toBe(false);
    });

    it('rejects when Node cannot launch', async () => {
        installFixture(path.join(directory, 'node_modules'));
        vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
            const child = new EventEmitter();
            queueMicrotask(() => child.emit('error', new Error('spawn ENOENT')));
            return child as ReturnType<typeof childProcess.spawn>;
        });
        await expect(restartCliAfterUpgrade({ locallyInstalled: true, version: '0.72.4' })).rejects.toThrow('spawn ENOENT');
    });
});
