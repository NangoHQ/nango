import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BASE_PATH_PLACEHOLDER } from './base-path.js';
import { setBasePath } from './set-base-path.js';

describe('setBasePath', () => {
    let root;
    let distDir;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'connect-ui-base-path-'));
        distDir = join(root, 'dist');
        await mkdir(distDir);
        await writeFile(join(distDir, 'index.html'), `<script src="${BASE_PATH_PLACEHOLDER}assets/index.js"></script>`);
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it('rewrites the placeholder to the configured base path', async () => {
        await setBasePath({ distDir, env: { NANGO_CONNECT_UI_BASE_PATH: '/nango/connect' } });

        await expect(readFile(join(distDir, 'index.html'), 'utf8')).resolves.toBe('<script src="/nango/connect/assets/index.js"></script>');
    });

    it('is a no-op on an already-rewritten dist (deployments always start from a pristine build)', async () => {
        await writeFile(join(distDir, 'index.html'), '<script src="/nango/connect/assets/index.js"></script>');

        await setBasePath({ distDir, env: { NANGO_CONNECT_UI_BASE_PATH: '/other' } });

        await expect(readFile(join(distDir, 'index.html'), 'utf8')).resolves.toBe('<script src="/nango/connect/assets/index.js"></script>');
    });
});
