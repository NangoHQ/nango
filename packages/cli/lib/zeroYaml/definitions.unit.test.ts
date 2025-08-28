import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { buildAction, buildSync } from './definitions.js';

describe('buildSync', () => {
    it('should build a sync', () => {
        const res = buildSync({
            filePath: './fetchIssues.ts',
            params: {
                type: 'sync',
                description: 'A sync',
                version: '1',
                endpoints: [{ method: 'GET', path: '/foobar' }],
                frequency: 'every 1 hour',
                autoStart: true,
                trackDeletes: false,
                syncType: 'full',
                webhookSubscriptions: ['*'],
                scopes: ['foobar'],
                models: {
                    Model: z.object({ id: z.string(), foobar: z.string() })
                },
                metadata: z.void(),
                exec: () => {
                    return;
                }
            },
            basename: 'fetchIssues',
            basenameClean: 'fetchIssues',
            integrationIdClean: 'github'
        });
        const def = res.unwrap();

        expect(def.sync).toStrictEqual<typeof def.sync>({
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
            output: ['Model']
        });
        expect(Array.from(def.models.values())).toStrictEqual([
            {
                fields: [{ name: 'metadata', tsType: true, value: 'void' }],
                isAnon: true,
                name: 'SyncMetadata_github_fetchIssues'
            },
            {
                fields: [
                    { name: 'id', optional: false, tsType: true, value: 'string' },
                    { name: 'foobar', optional: false, tsType: true, value: 'string' }
                ],
                name: 'Model'
            }
        ]);
    });

    it('should build an action', () => {
        const res = buildAction({
            params: {
                type: 'action',
                description: 'A sync',
                version: '1',
                endpoint: { method: 'GET', path: '/foobar' },
                scopes: ['foobar'],
                input: z.void(),
                output: z.number(),
                metadata: z.object({ foo: z.string() }),
                exec: () => {
                    return;
                }
            },
            basename: 'createIssue',
            basenameClean: 'createIssue',
            integrationIdClean: 'github'
        });

        expect(res.action).toStrictEqual<typeof res.action>({
            type: 'action',
            name: 'createIssue',
            description: 'A sync',
            version: '1',
            endpoint: { method: 'GET', path: '/foobar' },
            scopes: ['foobar'],
            input: 'ActionInput_github_createIssue',
            output: ['ActionOutput_github_createIssue'],
            usedModels: ['ActionInput_github_createIssue', 'ActionOutput_github_createIssue']
        });
        expect(Array.from(res.models.values())).toStrictEqual([
            {
                fields: [{ name: 'input', tsType: true, value: 'void' }],
                isAnon: true,
                name: 'ActionInput_github_createIssue'
            },
            {
                fields: [{ name: 'output', optional: false, tsType: true, value: 'number' }],
                isAnon: true,
                name: 'ActionOutput_github_createIssue'
            }
        ]);
    });
});
