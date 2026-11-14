import * as childProcess from 'child_process';
import fs from 'fs';
import { EventEmitter } from 'node:events';
import path from 'path';

import axios from 'axios';
import promptly from 'promptly';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { state } from './state.js';
import { detectPackageManager, getConfig, getConnection, http, upgradeAction } from './utils.js';
import { restartCliAfterUpgrade } from './utils/restart.js';
import { NANGO_VERSION } from './version.js';

vi.mock('child_process', async (importOriginal) => ({ ...(await importOriginal<typeof childProcess>()), spawn: vi.fn() }));
vi.mock('./utils/restart.js', () => ({ restartCliAfterUpgrade: vi.fn() }));

describe('detectPackageManager', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function mockFs(dirs: Record<string, { files?: string[]; packageManager?: string }>) {
        vi.spyOn(fs, 'readdirSync').mockImplementation((dir) => {
            return (dirs[dir as string]?.files ?? []) as any;
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            const dir = path.dirname(filePath as string);
            const pm = dirs[dir]?.packageManager;
            return JSON.stringify(pm ? { packageManager: pm } : {});
        });
    }

    it('detects pnpm via lock file', () => {
        mockFs({ '/project': { files: ['pnpm-lock.yaml'] } });
        expect(detectPackageManager({ fullPath: '/project' })).toBe('pnpm');
    });

    it('detects yarn via lock file', () => {
        mockFs({ '/project': { files: ['yarn.lock'] } });
        expect(detectPackageManager({ fullPath: '/project' })).toBe('yarn');
    });

    it('detects bun via bun.lockb', () => {
        mockFs({ '/project': { files: ['bun.lockb'] } });
        expect(detectPackageManager({ fullPath: '/project' })).toBe('bun');
    });

    it('detects bun via bun.lock', () => {
        mockFs({ '/project': { files: ['bun.lock'] } });
        expect(detectPackageManager({ fullPath: '/project' })).toBe('bun');
    });

    it('falls back to npm when no signals found', () => {
        mockFs({ '/project': { files: [] } });
        expect(detectPackageManager({ fullPath: '/project' })).toBe('npm');
    });

    it('detects package manager via packageManager field in package.json', () => {
        mockFs({ '/project': { files: ['package.json'], packageManager: 'pnpm@9.0.0' } });
        expect(detectPackageManager({ fullPath: '/project' })).toBe('pnpm');
    });

    it('packageManager field takes priority over lock files', () => {
        mockFs({ '/project': { files: ['package.json', 'pnpm-lock.yaml'], packageManager: 'yarn@4.1.0' } });
        expect(detectPackageManager({ fullPath: '/project' })).toBe('yarn');
    });

    it('detects pnpm lock file in a parent directory (monorepo)', () => {
        mockFs({
            '/project/apps/integrations': { files: [] },
            '/project/apps': { files: [] },
            '/project': { files: ['pnpm-lock.yaml'] }
        });
        expect(detectPackageManager({ fullPath: '/project/apps/integrations' })).toBe('pnpm');
    });

    it('detects packageManager field in a parent package.json (monorepo)', () => {
        mockFs({
            '/project/apps/integrations': { files: [] },
            '/project/apps': { files: [] },
            '/project': { files: ['package.json'], packageManager: 'pnpm@9.0.0' }
        });
        expect(detectPackageManager({ fullPath: '/project/apps/integrations' })).toBe('pnpm');
    });

    it('nearest package.json wins over parent lock file', () => {
        mockFs({
            '/project/apps/integrations': { files: ['package.json'], packageManager: 'yarn@4.1.0' },
            '/project/apps': { files: [] },
            '/project': { files: ['pnpm-lock.yaml'] }
        });
        expect(detectPackageManager({ fullPath: '/project/apps/integrations' })).toBe('yarn');
    });
});

describe('resolveHostport', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    async function importResolveHostport() {
        const mod = await import('./utils.js');
        return mod.resolveHostport;
    }

    it('defaults to cloud host when NANGO_HOSTPORT is not set', async () => {
        vi.stubEnv('NANGO_HOSTPORT', '');
        const resolveHostport = await importResolveHostport();
        expect(resolveHostport()).toBe('https://api.nango.dev');
    });

    it('uses NANGO_HOSTPORT when set', async () => {
        vi.stubEnv('NANGO_HOSTPORT', 'http://localhost:3003');
        const resolveHostport = await importResolveHostport();
        expect(resolveHostport()).toBe('http://localhost:3003');
    });

    it('strips trailing slash from NANGO_HOSTPORT', async () => {
        vi.stubEnv('NANGO_HOSTPORT', 'http://localhost:3003/');
        const resolveHostport = await importResolveHostport();
        expect(resolveHostport()).toBe('http://localhost:3003');
    });

    it('returns localhostUrl for env=local when NANGO_HOSTPORT is not set', async () => {
        vi.stubEnv('NANGO_HOSTPORT', '');
        const resolveHostport = await importResolveHostport();
        expect(resolveHostport('local')).toBe('http://localhost:3003');
    });

    it('ignores env=local when NANGO_HOSTPORT is explicitly set', async () => {
        vi.stubEnv('NANGO_HOSTPORT', 'https://my-nango.example.com');
        const resolveHostport = await importResolveHostport();
        expect(resolveHostport('local')).toBe('https://my-nango.example.com');
    });
});

describe('getEnvironments', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('warns and returns undefined when NANGO_SECRET_KEY is not set', async () => {
        vi.stubEnv('NANGO_SECRET_KEY', '');
        const { getEnvironments } = await import('./utils.js');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await getEnvironments();
        expect(result).toBeUndefined();
        expect(warn).toHaveBeenCalledOnce();
    });
});

describe('connection helpers', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns a Result success for getConnection', async () => {
        const data = { data: { id: 1, connection_id: 'conn-1' } };
        const get = vi.spyOn(http, 'get').mockResolvedValue({ data } as any);

        const result = await getConnection('github', 'conn-1', { 'Nango-Is-Dry-Run': true });

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(data);
        }
        expect(get).toHaveBeenCalledWith(expect.stringContaining('/connection/conn-1'), {
            params: { provider_config_key: 'github' },
            headers: expect.objectContaining({
                'Nango-Is-Dry-Run': true,
                Authorization: expect.any(String)
            })
        });
    });

    it('returns a Result error for getConnection request failures', async () => {
        vi.spyOn(http, 'get').mockRejectedValue(new Error('connection lookup failed'));

        const result = await getConnection('github', 'conn-1');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain('connection lookup failed');
        }
    });

    it('returns a Result success for getConfig', async () => {
        const data = { data: { provider: 'github' } };
        const get = vi.spyOn(http, 'get').mockResolvedValue({ data } as any);

        const result = await getConfig('github');

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual(data);
        }
        expect(get).toHaveBeenCalledWith(expect.stringContaining('/integrations/github'), {
            headers: expect.objectContaining({
                Authorization: expect.any(String)
            })
        });
    });

    it('returns a Result error for getConfig request failures', async () => {
        vi.spyOn(http, 'get').mockRejectedValue(new Error('config lookup failed'));

        const result = await getConfig('github');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain('config lookup failed');
        }
    });
});

describe('upgradeAction', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    beforeEach(() => {
        vi.stubEnv('NANGO_CLI_UPGRADE_MODE', 'auto');
        vi.spyOn(state, 'get').mockReturnValue(undefined);
        vi.spyOn(axios, 'get').mockResolvedValue({ data: { 'dist-tags': { latest: '99.0.0' } } });
        vi.mocked(childProcess.spawn).mockImplementation(() => {
            const child = new EventEmitter();
            queueMicrotask(() => child.emit('exit', 0));
            return child as ReturnType<typeof childProcess.spawn>;
        });
        vi.mocked(restartCliAfterUpgrade).mockReset();
    });

    it('exits after handing off to the upgraded CLI', async () => {
        vi.mocked(restartCliAfterUpgrade).mockResolvedValue(17);
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('parent exited');
        });
        await expect(upgradeAction()).rejects.toThrow('parent exited');
        expect(restartCliAfterUpgrade).toHaveBeenCalledWith({ locallyInstalled: expect.any(Boolean), version: '99.0.0' });
        expect(exit).toHaveBeenCalledWith(17);
    });

    it('exits with a rerun instruction if restarting fails', async () => {
        vi.mocked(restartCliAfterUpgrade).mockRejectedValue(new Error('missing executable'));
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('parent exited');
        });
        await expect(upgradeAction()).rejects.toThrow('parent exited');
        expect(exit).toHaveBeenCalledWith(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('Please rerun your command'));
    });

    it('does not restart when the upgrade is declined', async () => {
        vi.stubEnv('NANGO_CLI_UPGRADE_MODE', 'prompt');
        vi.spyOn(promptly, 'confirm').mockResolvedValue(false);
        vi.spyOn(state, 'set').mockImplementation(() => undefined);
        await upgradeAction();
        expect(restartCliAfterUpgrade).not.toHaveBeenCalled();
        expect(childProcess.spawn).not.toHaveBeenCalled();
    });

    it('does not restart when installing fails', async () => {
        vi.mocked(childProcess.spawn).mockImplementation(() => {
            const child = new EventEmitter();
            queueMicrotask(() => child.emit('exit', 1));
            return child as ReturnType<typeof childProcess.spawn>;
        });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await upgradeAction();
        expect(restartCliAfterUpgrade).not.toHaveBeenCalled();
    });

    it('skips the registry check in the restarted invocation', async () => {
        vi.stubEnv('NANGO_CLI_UPGRADE_MODE', 'ignore');
        await upgradeAction();
        expect(axios.get).not.toHaveBeenCalled();
        expect(restartCliAfterUpgrade).not.toHaveBeenCalled();
    });

    it('checks the npm registry without the Nango API client', async () => {
        vi.stubEnv('NANGO_CLI_UPGRADE_MODE', 'auto');
        vi.spyOn(state, 'get').mockReturnValue(undefined);
        const nangoHttpGet = vi.spyOn(http, 'get').mockRejectedValue(new Error('Nango API client must not be used for the npm registry'));
        const registryGet = vi.spyOn(axios, 'get').mockResolvedValue({ data: { 'dist-tags': { latest: NANGO_VERSION } } });

        await upgradeAction();

        expect(registryGet).toHaveBeenCalledWith(expect.stringContaining('registry.npmjs.org/nango'));
        expect(nangoHttpGet).not.toHaveBeenCalled();
        expect(restartCliAfterUpgrade).not.toHaveBeenCalled();
    });
});
