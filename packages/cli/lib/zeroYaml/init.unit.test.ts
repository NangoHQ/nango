import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { initZero } from './init.js';

describe('initZero', () => {
    const dirs: string[] = [];

    afterEach(() => {
        for (const dir of dirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        dirs.length = 0;
    });

    it('initializes without creating a default github integration', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nango-init-zero-'));
        dirs.push(tempDir);

        const result = await initZero({ absolutePath: tempDir, dependencyUpdate: false, interactive: false });

        expect(result).toBe(true);
        expect(fs.existsSync(path.join(tempDir, 'github'))).toBe(false);
        expect(fs.readFileSync(path.join(tempDir, 'index.ts'), 'utf-8')).not.toContain("import './github/");
    });
});
