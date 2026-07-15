import { exec as execCb } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { assert, describe, expect, it } from 'vitest';

import { copyDirectoryAndContents, fixturesPath, getTestDirectory } from '../tests/helpers.js';
import { bundleFile, compileAllFunctions, compileFunction, detectFeatures } from './compile.js';
import { validateFunction } from './definitions.js';
import { CompileError } from './utils.js';

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

        const nangoJson = JSON.parse(await fs.promises.readFile(path.join(dir, '.nango', 'nango.json'), 'utf8'));
        const github = nangoJson.find((integration: any) => integration.providerConfigKey === 'github');
        expect(github).toMatchObject({
            providerConfigKey: 'github',
            syncs: [{ name: 'fetchIssues' }],
            actions: [{ name: 'createIssue' }]
        });
        expect(github).not.toHaveProperty('functions');

        const functionsJson = JSON.parse(await fs.promises.readFile(path.join(dir, '.nango', 'functions.json'), 'utf8'));
        expect(functionsJson).toHaveLength(1);
        expect(functionsJson[0]).toMatchObject({
            name: 'fetchIssues',
            integrationId: 'github',
            description: 'Fetch a GitHub issue on demand',
            trigger: null,
            capabilities: { usesRecords: false, usesOutbound: true, usesCheckpoints: false, usesMetadata: false, usesInvoke: false }
        });
        expect(functionsJson[0].json_schema.definitions).toHaveProperty('FunctionInput_github_fetchIssues');
        expect(functionsJson[0].json_schema.definitions).toHaveProperty('FunctionOutput_github_fetchIssues');
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

describe('experimental functions', () => {
    it('should bundle a createFunction imported from nango/experimental', async () => {
        const result = await bundleFile({
            entryPoint: path.join(fixturesPath, 'zero/cases/createFunction.valid.js'),
            projectRootPath: fixturesPath
        });
        if (result.isErr()) {
            throw result.error;
        }
        expect(result.isOk()).toBe(true);
        // the nango/experimental import must not trip the disallowed-import guard
        expect(result.value).not.toContain('disallowed_import');
    });
});

describe('validateFunction', () => {
    const base = { integrationId: 'github', basename: 'fetchIssues' };

    it('accepts an invoke-only function with no trigger', () => {
        const res = validateFunction({ ...base, params: {} });
        expect(res.isOk()).toBe(true);
    });

    it('rejects an http trigger (not supported yet)', () => {
        const res = validateFunction({ ...base, params: { trigger: { kind: 'http' } } });
        assert(res.isErr());
        expect(res.error.message).toContain("unsupported trigger kind 'http'");
    });

    it('rejects a schedule trigger', () => {
        const res = validateFunction({ ...base, params: { trigger: { kind: 'schedule', frequency: 'every hour' } } });
        assert(res.isErr());
        expect(res.error.message).toContain("unsupported trigger kind 'schedule'");
    });

    it('rejects declaring data', () => {
        const res = validateFunction({ ...base, params: { data: { models: {} } } });
        assert(res.isErr());
        expect(res.error.message).toContain("declares 'data'");
    });

    it('rejects requires.invoke', () => {
        const res = validateFunction({ ...base, params: { requires: { invoke: true } } });
        assert(res.isErr());
        expect(res.error.message).toContain('requires.invoke');
    });

    it('rejects connection-less functions', () => {
        const res = validateFunction({ ...base, params: { requires: { connection: false } } });
        assert(res.isErr());
        expect(res.error.message).toContain('connection-less');
    });
});

describe('bundleDependencies', () => {
    // The fixture's workspace package must be resolvable via node_modules (mirroring a workspace
    // symlink). node_modules is gitignored, so we materialize it into a temp project at runtime.
    async function setupBundleProject() {
        const dir = await getTestDirectory('zero_bundle');
        await copyDirectoryAndContents(path.join(fixturesPath, 'zero/bundle'), dir);
        const sharedDest = path.join(dir, 'node_modules', '@repo', 'shared');
        await fs.promises.mkdir(sharedDest, { recursive: true });
        await copyDirectoryAndContents(path.join(dir, 'shared-pkg'), sharedDest);
        return { dir, entryPoint: path.join(dir, 'importsWorkspace.js') };
    }

    it('should reject a workspace import that is not opted-in', async () => {
        const { dir, entryPoint } = await setupBundleProject();
        const result = await bundleFile({ entryPoint, projectRootPath: dir });
        assert(result.isErr(), 'Should be an error');
        assert(result.error instanceof CompileError, 'Should be a CompileError');
        expect(result.error.type).toBe('disallowed_import');
    });

    it('should bundle (inline) a workspace import when opted-in', async () => {
        const { dir, entryPoint } = await setupBundleProject();
        const result = await bundleFile({ entryPoint, projectRootPath: dir, bundleDependencies: ['@repo/shared'] });
        const value = result.unwrap();
        // The inlined implementation must be present in the bundled output...
        expect(value).toContain('.trim().toLowerCase()');
        // ...and it must NOT be left as an external require.
        expect(value).not.toContain('require("@repo/shared")');
    });

    it('should inline a subpath-matched import of an opted-in dependency prefix', async () => {
        const { dir, entryPoint } = await setupBundleProject();
        // '@repo' is a prefix; '@repo/shared' matches as a subpath and is inlined.
        const result = await bundleFile({ entryPoint, projectRootPath: dir, bundleDependencies: ['@repo'] });
        const value = result.unwrap();
        expect(value).toContain('.trim().toLowerCase()');
    });

    it('should write a compiled artifact with the dependency inlined (compileFunction)', async () => {
        const { dir, entryPoint } = await setupBundleProject();
        const result = await compileFunction({ entryPoint, projectRootPath: dir, bundleDependencies: ['@repo/shared'] });
        expect(result.isOk()).toBe(true);
        const artifact = path.join(dir, 'build', 'importsWorkspace.cjs');
        expect(fs.existsSync(artifact)).toBe(true);
        const written = await fs.promises.readFile(artifact, 'utf8');
        expect(written).toContain('.trim().toLowerCase()');
    });

    it('should not let a Node built-in bypass the allowlist via bundleDependencies', async () => {
        // A script importing a Node built-in must stay rejected even if the built-in is listed,
        // because esbuild leaves built-ins external and they would reach the sandbox.
        const dir = await getTestDirectory('zero_bundle_builtin');
        await fs.promises.mkdir(path.join(dir, 'syncs'), { recursive: true });
        const sync = [
            `import { createSync } from 'nango';`,
            `import * as z from 'zod';`,
            `import fs from 'fs';`,
            `export default createSync({`,
            `    description: 'x', version: '1.0.0',`,
            `    endpoints: [{ method: 'GET', path: '/x', group: 'X' }],`,
            `    frequency: 'every hour', syncType: 'full',`,
            `    models: { M: z.object({ id: z.string() }) },`,
            `    exec: async (nango) => { await nango.log(String(fs.readdirSync('/'))); }`,
            `});`
        ].join('\n');
        await fs.promises.writeFile(path.join(dir, 'syncs', 'usesFs.ts'), sync);

        const result = await bundleFile({ entryPoint: path.join(dir, 'syncs', 'usesFs.js'), projectRootPath: dir, bundleDependencies: ['fs'] });
        assert(result.isErr(), 'Should be an error');
        assert(result.error instanceof CompileError, 'Should be a CompileError');
        expect(result.error.type).toBe('disallowed_import');
    });

    it('should fail compilation when bundleDependencies lists a Node built-in', async () => {
        const { dir } = await setupBundleProject();
        // A minimal index.ts so compileAllFunctions has an entry point.
        await fs.promises.writeFile(path.join(dir, 'index.ts'), `import './importsWorkspace.js';\n`);
        await fs.promises.writeFile(
            path.join(dir, 'package.json'),
            JSON.stringify({ name: 'test', type: 'module', bundleDependencies: ['fs', '@repo/shared'] })
        );

        const result = await compileAllFunctions({ fullPath: dir, debug: false, interactive: false });
        assert(result.isErr(), 'Should be an error');
        expect(result.error.message).toContain('Node built-in');
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
