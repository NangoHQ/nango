import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectPackageManager } from './utils.js';

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
