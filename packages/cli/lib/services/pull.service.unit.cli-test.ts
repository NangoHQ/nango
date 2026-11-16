import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixturesPath } from '../tests/helpers.js';
import { cliFetch } from '../tls.js';
import { compileAllFunctions } from '../zeroYaml/compile.js';
import { pullFunction } from './pull.service.js';

vi.mock('../tls.js', () => ({ cliFetch: vi.fn() }));

describe('pull → compile', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.mocked(cliFetch).mockReset();
    });

    it('compiles a tool pulled by its public name rather than its original filename', async () => {
        const fullPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-pull-tool-'));
        try {
            vi.stubEnv('NANGO_SECRET_KEY_DEV', 'secret-dev');
            vi.stubEnv('NANGO_SECRET_KEY', undefined);
            vi.spyOn(console, 'log').mockImplementation(() => undefined);
            // getIssue.ts declares name: 'get_issue' and has no relative imports.
            const source = await fs.readFile(path.join(fixturesPath, 'zero/valid/github/tools/getIssue.ts'), 'utf8');
            vi.mocked(cliFetch).mockResolvedValue(new Response(JSON.stringify({ type: 'tool', code: source }), { status: 200 }));

            await fs.mkdir(path.join(fullPath, 'node_modules'));
            await fs.symlink(path.resolve(fixturesPath, '..'), path.join(fullPath, 'node_modules', 'nango'), 'dir');
            await fs.symlink(path.dirname(fileURLToPath(import.meta.resolve('zod'))), path.join(fullPath, 'node_modules', 'zod'), 'dir');
            await fs.writeFile(path.join(fullPath, 'package.json'), JSON.stringify({ type: 'module' }));

            const success = await pullFunction({
                fullPath,
                integrationId: 'github',
                name: 'get_issue',
                environmentName: 'dev',
                debug: false,
                force: false,
                autoConfirm: false,
                interactive: false
            });

            expect(success).toBe(true);
            expect(await fs.readFile(path.join(fullPath, 'github/tools/get_issue.ts'), 'utf8')).toBe(source);
            expect(await fs.readFile(path.join(fullPath, 'index.ts'), 'utf8')).toBe("\nimport './github/tools/get_issue.js';\n");
            const compiled = await compileAllFunctions({ fullPath, debug: false, interactive: false });
            expect(compiled.unwrap()).toBe(true);
            expect(JSON.parse(await fs.readFile(path.join(fullPath, '.nango/functions.json'), 'utf8'))).toMatchObject([
                { name: 'get_issue', integrationId: 'github', filePath: './github/tools/get_issue.ts', trigger: { kind: 'http' } }
            ]);
        } finally {
            await fs.rm(fullPath, { recursive: true, force: true });
        }
    });
});
