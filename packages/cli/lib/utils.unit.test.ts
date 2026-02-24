import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
