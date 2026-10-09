import path from 'node:path';

import { assert, describe, expect, it } from 'vitest';
import * as z from 'zod';

import { fixturesPath } from '../tests/helpers.js';
import { parseAction, parseFunction, parseSync } from './definitions.js';

const syncParams = {
    type: 'sync' as const,
    description: 'A sync',
    version: '1',
    endpoints: [{ method: 'GET' as const, path: '/foobar' }],
    frequency: 'every 1 hour',
    autoStart: true,
    trackDeletes: false,
    syncType: 'full' as const,
    webhookSubscriptions: ['*'],
    scopes: ['foobar'],
    models: {
        Model: z.object({ id: z.string(), foobar: z.string() })
    },
    metadata: z.void(),
    exec: () => {
        return;
    }
};

const actionParams = {
    type: 'action' as const,
    description: 'An action',
    version: '1',
    endpoint: { method: 'GET' as const, path: '/foobar' },
    scopes: ['foobar'],
    input: z.void(),
    output: z.number(),
    metadata: z.object({ foo: z.string() }),
    exec: () => {
        return;
    }
};

describe('parseSync', () => {
    it('should return the parsed sync without endpoints', () => {
        const { endpoints, ...syncParamsWithoutEndpoints } = syncParams;
        const res = parseSync({
            filePath: './fetchIssues.ts',
            absoluteFilePath: '/tmp/fetchIssues.ts',
            params: syncParamsWithoutEndpoints,
            basename: 'fetchIssues',
            basenameClean: 'fetchIssues',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({
            type: 'sync',
            name: 'fetchIssues',
            endpoints: []
        });
    });

    it('should return the parsed sync', () => {
        const res = parseSync({
            filePath: './fetchIssues.ts',
            absoluteFilePath: '/tmp/fetchIssues.ts',
            params: syncParams,
            basename: 'fetchIssues',
            basenameClean: 'fetchIssues',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({
            type: 'sync',
            name: 'fetchIssues',
            description: 'A sync',
            version: '1',
            endpoints: [{ method: 'GET', path: '/foobar' }],
            runs: 'every 1 hour',
            auto_start: true,
            track_deletes: false,
            sync_type: 'full',
            webhookSubscriptions: ['*'],
            scopes: ['foobar'],
            usedModels: ['Model', 'SyncMetadata_github_fetchIssues'],
            input: 'SyncMetadata_github_fetchIssues',
            output: ['Model'],
            json_schema: {
                definitions: {
                    Model: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            id: { type: 'string' },
                            foobar: { type: 'string' }
                        },
                        required: ['id', 'foobar']
                    }
                }
            }
        });
    });

    it('should mark checkpoint as false when no checkpoint schema is declared', () => {
        const res = parseSync({
            filePath: './fetchIssues.ts',
            absoluteFilePath: '/tmp/fetchIssues.ts',
            params: syncParams,
            basename: 'fetchIssues',
            basenameClean: 'fetchIssues',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({ checkpoint: false });
    });

    it('should mark checkpoint as true when a checkpoint schema is declared', () => {
        const res = parseSync({
            filePath: './fetchIssues.ts',
            absoluteFilePath: '/tmp/fetchIssues.ts',
            params: { ...syncParams, checkpoint: z.object({ cursor: z.string() }) },
            basename: 'fetchIssues',
            basenameClean: 'fetchIssues',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({ checkpoint: true });
    });

    it('should fail when a checkpoint schema is declared but the file never calls a checkpoint method', () => {
        const unusedCheckpointFile = path.join(fixturesPath, 'zero/valid/github/syncs/fetchIssues.ts');
        const res = parseSync({
            filePath: './fetchIssues.ts',
            absoluteFilePath: unusedCheckpointFile,
            params: { ...syncParams, checkpoint: z.object({ cursor: z.string() }) },
            basename: 'fetchIssues',
            basenameClean: 'fetchIssues',
            integrationIdClean: 'github'
        });

        assert(res.isErr(), 'Should be an error');
        expect(res.error.message).toContain(`A 'checkpoint' schema is declared but never used`);
    });

    it('should not fail when a checkpoint schema is declared and the file calls a checkpoint method', () => {
        const usedCheckpointFile = path.join(fixturesPath, 'zero/cases/features.ts');
        const res = parseSync({
            filePath: './features.ts',
            absoluteFilePath: usedCheckpointFile,
            params: { ...syncParams, checkpoint: z.object({ cursor: z.string() }) },
            basename: 'features',
            basenameClean: 'features',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({ checkpoint: true });
    });
});

describe('parseAction', () => {
    it('should return the parsed action without endpoint', () => {
        const { endpoint, ...actionParamsWithoutEndpoint } = actionParams;
        const res = parseAction({
            filePath: './createIssue.ts',
            absoluteFilePath: '/tmp/createIssue.ts',
            params: actionParamsWithoutEndpoint,
            basename: 'createIssue',
            basenameClean: 'createIssue',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({
            type: 'action',
            name: 'createIssue',
            endpoint: null
        });
    });

    it('should return the parsed action', () => {
        const res = parseAction({
            filePath: './createIssue.ts',
            absoluteFilePath: '/tmp/createIssue.ts',
            params: actionParams,
            basename: 'createIssue',
            basenameClean: 'createIssue',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({
            type: 'action',
            name: 'createIssue',
            description: 'An action',
            version: '1',
            endpoint: { method: 'GET' as const, path: '/foobar' },
            scopes: ['foobar'],
            input: 'ActionInput_github_createIssue',
            output: ['ActionOutput_github_createIssue'],
            usedModels: ['ActionInput_github_createIssue', 'ActionOutput_github_createIssue'],
            json_schema: {
                definitions: {
                    ActionOutput_github_createIssue: { type: 'number' }
                }
            }
        });
    });

    it('should mark checkpoint as false when no checkpoint schema is declared', () => {
        const res = parseAction({
            filePath: './createIssue.ts',
            absoluteFilePath: '/tmp/createIssue.ts',
            params: actionParams,
            basename: 'createIssue',
            basenameClean: 'createIssue',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({ checkpoint: false });
    });

    it('should mark checkpoint as true when a checkpoint schema is declared', () => {
        const res = parseAction({
            filePath: './createIssue.ts',
            absoluteFilePath: '/tmp/createIssue.ts',
            params: { ...actionParams, checkpoint: z.object({ cursor: z.string() }) },
            basename: 'createIssue',
            basenameClean: 'createIssue',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({ checkpoint: true });
    });

    it('should not fail when a checkpoint schema is declared and the file calls a checkpoint method', () => {
        const usedCheckpointFile = path.join(fixturesPath, 'zero/cases/features.ts');
        const res = parseAction({
            filePath: './features.ts',
            absoluteFilePath: usedCheckpointFile,
            params: { ...actionParams, checkpoint: z.object({ cursor: z.string() }) },
            basename: 'features',
            basenameClean: 'features',
            integrationIdClean: 'github'
        });

        expect(res.unwrap()).toMatchObject({ checkpoint: true });
    });

    it('should fail when a checkpoint schema is declared but the file never calls a checkpoint method', () => {
        const unusedCheckpointFile = path.join(fixturesPath, 'zero/valid/github/actions/createIssue.ts');
        const res = parseAction({
            filePath: './createIssue.ts',
            absoluteFilePath: unusedCheckpointFile,
            params: { ...actionParams, checkpoint: z.object({ cursor: z.string() }) },
            basename: 'createIssue',
            basenameClean: 'createIssue',
            integrationIdClean: 'github'
        });

        assert(res.isErr(), 'Should be an error');
        expect(res.error.message).toContain(`A 'checkpoint' schema is declared but never used`);
    });
});

describe('parseFunction', () => {
    const common = {
        integrationId: 'github',
        integrationIdClean: 'github',
        basename: 'fetchIssues',
        basenameClean: 'fetchIssues'
    };
    const params = {
        description: 'A function'
    };

    it('normalizes an invoke-only connection-bound function', () => {
        const fn = parseFunction({ ...common, params });

        expect(fn).toMatchObject({
            trigger: { kind: 'none' },
            requires: { connection: true, outbound: true, invoke: false },
            limits: { concurrency: { perConnection: 'max' } },
            input_schema_ref: null,
            output_schema_ref: null,
            model_schema_refs: [],
            metadata_schema_ref: null,
            checkpoint_schema_ref: null
        });
    });

    it('normalizes scheduled function concurrency to one', () => {
        const fn = parseFunction({
            ...common,
            params: { ...params, trigger: { kind: 'schedule', frequency: 'every hour' } }
        });

        expect(fn.limits).toEqual({ concurrency: { perConnection: 1 } });
    });

    it('omits per-connection concurrency for connection-less functions', () => {
        const fn = parseFunction({
            ...common,
            params: { ...params, requires: { connection: false } }
        });

        expect(fn.limits).toEqual({});
        expect(fn.requires).toEqual({ connection: false, outbound: false, invoke: false });
    });

    it('normalizes explicitly selected requirements', () => {
        const fn = parseFunction({
            ...common,
            params: { ...params, requires: { outbound: false, invoke: true } }
        });

        expect(fn.requires).toEqual({ connection: true, outbound: false, invoke: true });
    });

    it('emits references for every declared schema', () => {
        const fn = parseFunction({
            ...common,
            params: {
                ...params,
                input: z.object({ query: z.string() }),
                output: z.object({ count: z.number() }),
                data: {
                    models: { GithubIssue: z.object({ id: z.string() }) },
                    metadata: z.object({ cursor: z.string() }),
                    checkpoint: z.object({ page: z.number() })
                }
            }
        });

        expect(fn).toMatchObject({
            input_schema_ref: '#/definitions/FunctionInput_github_fetchIssues',
            output_schema_ref: '#/definitions/FunctionOutput_github_fetchIssues',
            model_schema_refs: ['#/definitions/GithubIssue'],
            metadata_schema_ref: '#/definitions/FunctionMetadata_github_fetchIssues',
            checkpoint_schema_ref: '#/definitions/FunctionCheckpoint_github_fetchIssues'
        });
        expect(fn.json_schema.definitions).toHaveProperty('FunctionInput_github_fetchIssues');
        expect(fn.json_schema.definitions).toHaveProperty('FunctionOutput_github_fetchIssues');
        expect(fn.json_schema.definitions).toHaveProperty('GithubIssue');
        expect(fn.json_schema.definitions).toHaveProperty('FunctionMetadata_github_fetchIssues');
        expect(fn.json_schema.definitions).toHaveProperty('FunctionCheckpoint_github_fetchIssues');
    });
});
