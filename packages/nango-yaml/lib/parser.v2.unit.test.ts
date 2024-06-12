import { expect, describe, it } from 'vitest';
import { NangoYamlParserV2 } from './parser.v2.js';
import type { NangoYamlParsed, NangoYamlV2 } from '@nangohq/types';
import { ParserErrorEndpointsMismatch, ParserErrorModelNotFound } from './errors.js';

describe('parse', () => {
    it('should parse', () => {
        const v2: NangoYamlV2 = {
            models: { GithubIssue: { id: 'string' } },
            integrations: { provider: { syncs: { top: { runs: 'every day', input: 'GithubIssue', output: 'GithubIssue', endpoint: 'GET /provider/top' } } } }
        };
        const parser = new NangoYamlParserV2({ raw: v2 });
        parser.parse();
        expect(parser.errors).toStrictEqual([]);
        expect(parser.parsed).toStrictEqual<NangoYamlParsed>({
            integrations: [
                {
                    providerConfigKey: 'provider',
                    syncs: [
                        {
                            auto_start: true,
                            description: '',
                            endpoints: [{ GET: '/provider/top' }],
                            input: 'GithubIssue',
                            name: 'top',
                            output: ['GithubIssue'],
                            runs: 'every day',
                            scopes: [],
                            sync_type: 'full',
                            track_deletes: false,
                            type: 'sync',
                            usedModels: ['GithubIssue'],
                            webhookSubscriptions: []
                        }
                    ],
                    postConnectionScripts: [],
                    actions: []
                }
            ],
            models: new Map([['GithubIssue', { name: 'GithubIssue', fields: [{ name: 'id', value: 'string', tsType: true, array: false }] }]]),
            yamlVersion: 'v2'
        });
    });

    it('should fail on missing model', () => {
        const v1: NangoYamlV2 = {
            models: {},
            integrations: { provider: { syncs: { top: { runs: 'every day', output: 'GithubIssue', endpoint: 'GET /provider/top' } } } }
        };
        const parser = new NangoYamlParserV2({ raw: v1 });
        parser.parse();
        expect(parser.errors).toStrictEqual([
            new ParserErrorModelNotFound({ model: 'GithubIssue', path: 'sync > top' }),
            new ParserErrorEndpointsMismatch({ syncName: 'top', path: `syncs > top` })
        ]);
    });
});
