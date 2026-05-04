import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { parseAction, parseSync } from './definitions.js';

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
});

describe('parseAction', () => {
    it('should return the parsed action without endpoint', () => {
        const { endpoint, ...actionParamsWithoutEndpoint } = actionParams;
        const action = parseAction({
            filePath: './createIssue.ts',
            params: actionParamsWithoutEndpoint,
            basename: 'createIssue',
            basenameClean: 'createIssue',
            integrationIdClean: 'github'
        });

        expect(action).toMatchObject({
            type: 'action',
            name: 'createIssue',
            endpoint: null
        });
    });

    it('should return the parsed action', () => {
        const action = parseAction({
            filePath: './createIssue.ts',
            params: actionParams,
            basename: 'createIssue',
            basenameClean: 'createIssue',
            integrationIdClean: 'github'
        });

        expect(action).toMatchObject({
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
});
