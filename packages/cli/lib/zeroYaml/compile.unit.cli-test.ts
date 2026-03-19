import { exec as execCb } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { assert, describe, expect, it } from 'vitest';

import { bundleFile, compileAllFunctions, detectFeatures } from './compile.js';
import { CompileError } from './utils.js';
import { copyDirectoryAndContents, fixturesPath, getTestDirectory } from '../tests/helpers.js';

const exec = promisify(execCb);

describe('bundleFile', () => {
    it('should bundle a sync with a constant export', async () => {
        const result = await bundleFile({ entryPoint: path.join(fixturesPath, 'zero/valid/github/syncs/fetchIssues.js'), projectRootPath: fixturesPath });
        const value = result.unwrap();
        expect(value).toMatchSnapshot();
    });

    it('should bundle an action with a default export', async () => {
        const result = await bundleFile({ entryPoint: path.join(fixturesPath, 'zero/valid/github/actions/createIssue.js'), projectRootPath: fixturesPath });
        const value = result.unwrap();
        expect(value).toMatchSnapshot();
    });
});

describe('compileAll', () => {
    it('should compile a minimal integration', async () => {
        const dir = await getTestDirectory('zero_valid');
        console.log('compiling to ', dir);
        await copyDirectoryAndContents(path.join(fixturesPath, 'zero/valid'), dir);

        const pkg = { name: 'test', type: 'module', dependencies: { nango: `file:${path.resolve(path.join(fixturesPath, '..'))}`, zod: '4.3.6' } };

        await fs.promises.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
        await exec('npm i', { cwd: dir });
        const result = await compileAllFunctions({ fullPath: dir, debug: false });
        result.unwrap();
        expect(result.isOk()).toBe(true);
    });
});

describe('edge cases', () => {
    it('should catch invalid setMergingStrategy', async () => {
        const result = await bundleFile({ entryPoint: path.join(fixturesPath, 'zero/cases/setMergingStrategy.error.js'), projectRootPath: fixturesPath });
        if (result.isErr()) {
            expect(result.error.message.replaceAll('\\', '/')).toMatchSnapshot();
        } else {
            throw new Error('should be an error');
        }
    });

    it('should allow setMergingStrategy', async () => {
        const result = await bundleFile({ entryPoint: path.join(fixturesPath, 'zero/cases/setMergingStrategy.valid.js'), projectRootPath: fixturesPath });
        if (result.isErr()) {
            throw result.error;
        }
        expect(result.isOk()).toBe(true);
    });

    it('should catch multiple exports', async () => {
        const result = await bundleFile({ entryPoint: path.join(fixturesPath, 'zero/cases/multipleExports.js'), projectRootPath: fixturesPath });
        assert(result.isErr(), 'Should be an error');
        assert(result.error instanceof CompileError, 'Should be an error');

        expect(result.error.toText().replaceAll('\\', '/')).toMatchSnapshot();
    });
});

describe('detectFeatures', () => {
    it('should fail if entrypoint does not exists', () => {
        const res = detectFeatures({ entryPoint: path.join(fixturesPath, 'does/not/exist.ts') });
        expect(res.isErr()).toBe(true);
    });
    it('should detect features', () => {
        const features = detectFeatures({ entryPoint: path.join(fixturesPath, 'zero/cases/features.ts') }).unwrap();
        expect(features).toEqual(['checkpoints']);
    });
    it('should not detect features if none', () => {
        const features = detectFeatures({ entryPoint: path.join(fixturesPath, 'zero/cases/features.none.ts') }).unwrap();
        expect(features).toEqual([]);
    });
});
