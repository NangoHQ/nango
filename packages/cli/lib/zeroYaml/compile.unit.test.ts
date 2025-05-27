import { exec as execCb } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execCb);
import { describe, expect, it } from 'vitest';

import { compileAll } from './compile.js';
import { copyDirectoryAndContents, fixturesPath, getTestDirectory } from '../tests/helpers.js';

describe('compileAll', () => {
    it('should compile a minimal integration', async () => {
        const dir = await getTestDirectory('zero_valid');
        console.log('compiling to ', dir);
        await copyDirectoryAndContents(path.join(fixturesPath, 'zero/valid'), dir);

        const pkg = { name: 'test', dependencies: { nango: `file:${path.resolve(path.join(fixturesPath, '..'))}`, zod: '3.24.2' } };

        await fs.promises.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
        await exec('npm i', { cwd: dir });
        const result = await compileAll({ fullPath: dir, debug: false });
        expect(result.isOk()).toBe(true);
    });
});
