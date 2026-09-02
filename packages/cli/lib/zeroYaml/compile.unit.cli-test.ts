import { exec as execCb } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { assert, describe, expect, it } from 'vitest';
import * as z from 'zod';

import { copyDirectoryAndContents, fixturesPath, getTestDirectory } from '../tests/helpers.js';
import { bundleFile, compileAllFunctions, detectFeatures } from './compile.js';
import { getIntegrationId, validateFunction } from './definitions.js';
import { CompileError } from './utils.js';

import type { FunctionTriggerDefinition } from '@nangohq/types';

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

        const indexPath = path.join(dir, 'index.ts');
        const indexContent = await fs.promises.readFile(indexPath, 'utf8');
        await fs.promises.writeFile(indexPath, indexContent.replace('./github/functions/fetchIssues.js', './github/nested/../functions/fetchIssues.js'));

        const pkg = { name: 'test', type: 'module', dependencies: { nango: `file:${path.resolve(path.join(fixturesPath, '..'))}`, zod: '4.3.6' } };

        const dottedIntegrationFunctionsPath = path.join(dir, 'github.js', 'functions');
        await fs.promises.mkdir(dottedIntegrationFunctionsPath, { recursive: true });
        await fs.promises.copyFile(path.join(dir, 'github', 'functions', 'fetchIssues.ts'), path.join(dottedIntegrationFunctionsPath, 'fetchIssues.ts'));
        await fs.promises.appendFile(indexPath, "\nimport './github.js/functions/fetchIssues.js';\n");
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
        expect(functionsJson).toHaveLength(2);
        expect(functionsJson[0]).toMatchObject({
            name: 'fetchIssues',
            integrationId: 'github',
            filePath: './github/functions/fetchIssues.ts',
            description: 'Fetch a GitHub issue on demand',
            trigger: { kind: 'http' },
            requires: { connection: true, outbound: true, invoke: false },
            capabilities: { usesRecords: false, usesOutbound: true, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
            limits: { concurrency: { perConnection: 'max' } },
            input_schema_ref: '#/definitions/FunctionInput_github_fetchIssues',
            output_schema_ref: '#/definitions/FunctionOutput_github_fetchIssues',
            model_schema_refs: [],
            metadata_schema_ref: null,
            checkpoint_schema_ref: null
        });
        expect(functionsJson[0].json_schema.definitions).toHaveProperty('FunctionInput_github_fetchIssues');
        expect(functionsJson[0].json_schema.definitions).toHaveProperty('FunctionOutput_github_fetchIssues');
        expect(functionsJson[1]).toMatchObject({
            name: 'fetchIssues',
            integrationId: 'github.js',
            filePath: './github.js/functions/fetchIssues.ts'
        });
        expect(fs.existsSync(path.join(dir, 'build', 'github.js_functions_fetchIssues.cjs'))).toBe(true);
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

    it("accepts an explicit 'none' trigger", () => {
        const res = validateFunction({ ...base, params: { trigger: { kind: 'none' } } });
        expect(res.isOk()).toBe(true);
    });

    it('accepts an http trigger', () => {
        const res = validateFunction({ ...base, params: { trigger: { kind: 'http' } } });
        expect(res.isOk()).toBe(true);
    });

    it('rejects an http trigger with subscriptions', () => {
        const res = validateFunction({ ...base, params: { trigger: { kind: 'http', subscriptions: ['issues'] } } });
        assert(res.isErr());
        expect(res.error.message).toContain("unsupported HTTP trigger options: 'subscriptions'");
    });

    it('rejects an http trigger with debounce', () => {
        const res = validateFunction({ ...base, params: { trigger: { kind: 'http', debounce: { windowMs: 1000 } } } });
        assert(res.isErr());
        expect(res.error.message).toContain("unsupported HTTP trigger options: 'debounce'");
    });

    it('reports all unsupported http trigger options', () => {
        const res = validateFunction({
            ...base,
            params: { trigger: { kind: 'http', subscriptions: [], debounce: { windowMs: 1000 } } }
        });
        assert(res.isErr());
        expect(res.error.message).toContain("unsupported HTTP trigger options: 'subscriptions', 'debounce'");
    });

    it('rejects unknown http trigger attributes', () => {
        const res = validateFunction({
            ...base,
            params: { trigger: { kind: 'http', subscription: ['issues'], unexpected: true } as unknown as FunctionTriggerDefinition }
        });
        assert(res.isErr());
        expect(res.error.message).toContain('invalid trigger definition');
        expect(res.error.message).toContain('subscription');
        expect(res.error.message).toContain('unexpected');
    });

    it('rejects unknown attributes on a trigger without options', () => {
        const res = validateFunction({
            ...base,
            params: { trigger: { kind: 'none', unexpected: true } as unknown as FunctionTriggerDefinition }
        });
        assert(res.isErr());
        expect(res.error.message).toContain('invalid trigger definition');
        expect(res.error.message).toContain('unexpected');
    });

    it('rejects malformed nested trigger options', () => {
        const res = validateFunction({
            ...base,
            params: { trigger: { kind: 'http', debounce: { windowMs: '1000' } } as unknown as FunctionTriggerDefinition }
        });
        assert(res.isErr());
        expect(res.error.message).toContain('invalid trigger definition');
        expect(res.error.message).toContain('debounce.windowMs');
    });

    it('rejects a schedule trigger', () => {
        const res = validateFunction({ ...base, params: { trigger: { kind: 'schedule', frequency: 'every hour' } } });
        assert(res.isErr());
        expect(res.error.message).toContain("unsupported trigger kind 'schedule'");
    });

    it('allows declaring metadata and checkpoint', () => {
        const res = validateFunction({ ...base, params: { data: { metadata: z.object({}), checkpoint: z.object({}) } } });
        assert(res.isOk());
    });

    it('rejects declaring models', () => {
        const res = validateFunction({ ...base, params: { data: { models: { Issue: z.object({ id: z.string() }) } } } });
        assert(res.isErr());
        expect(res.error.message).toContain("declares 'data.models'");
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

describe('getIntegrationId', () => {
    it('uses the first directory after the relative prefix', () => {
        expect(getIntegrationId('./github/fetchIssues.js').unwrap()).toBe('github');
        expect(getIntegrationId('./github/custom/nested/fetchIssues.js').unwrap()).toBe('github');
    });

    it('keeps legacy script paths compatible', () => {
        expect(getIntegrationId('./github/syncs/fetchIssues.js').unwrap()).toBe('github');
        expect(getIntegrationId('./github/actions/createIssue.js').unwrap()).toBe('github');
    });

    it('uses the integration from the normalized path', () => {
        expect(getIntegrationId('./github/../slack/functions/fetchIssues.js').unwrap()).toBe('slack');
        expect(getIntegrationId('.\\github\\nested\\..\\functions\\fetchIssues.js').unwrap()).toBe('github');
    });

    it('rejects files outside an integration folder', () => {
        const result = getIntegrationId('./fetchIssues.js');
        expect(result.isErr()).toBe(true);
    });

    it.each(['./../outside/fetchIssues.js', './github/../../outside/fetchIssues.js'])('rejects paths outside the project folder: %s', (filePath) => {
        const result = getIntegrationId(filePath);
        expect(result.isErr()).toBe(true);
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
