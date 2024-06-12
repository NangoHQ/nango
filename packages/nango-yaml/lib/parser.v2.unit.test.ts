import { expect, describe, it } from 'vitest';
import { NangoYamlParserV2 } from './parser.v2.js';
import type { NangoYamlParsed, NangoYamlV2 } from '@nangohq/types';
import { ParserErrorModelIsLiteral } from './errors.js';

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

    it('should handle input / output as literal', () => {
        const v2: NangoYamlV2 = {
            models: {},
            integrations: { provider: { syncs: { top: { runs: 'every day', input: 'boolean', output: 'foobar', endpoint: 'GET /provider/top' } } } }
        };
        const parser = new NangoYamlParserV2({ raw: v2 });
        parser.parse();
        expect(parser.errors).toStrictEqual([]);
        expect(parser.warnings).toStrictEqual([
            new ParserErrorModelIsLiteral({ model: 'foobar', path: ['provider', 'sync', 'top', '[output]'] }),
            new ParserErrorModelIsLiteral({ model: 'boolean', path: ['provider', 'sync', 'top', '[input]'] })
        ]);
        expect(parser.parsed).toStrictEqual<NangoYamlParsed>({
            integrations: [
                {
                    providerConfigKey: 'provider',
                    syncs: [
                        {
                            auto_start: true,
                            description: '',
                            endpoints: [{ GET: '/provider/top' }],
                            input: 'Anonymous_provider_sync_top_input',
                            name: 'top',
                            output: ['Anonymous_provider_sync_top_output'],
                            runs: 'every day',
                            scopes: [],
                            sync_type: 'full',
                            track_deletes: false,
                            type: 'sync',
                            usedModels: ['Anonymous_provider_sync_top_output', 'Anonymous_provider_sync_top_input'],
                            webhookSubscriptions: []
                        }
                    ],
                    postConnectionScripts: [],
                    actions: []
                }
            ],
            models: new Map([
                [
                    'Anonymous_provider_sync_top_output',
                    { name: 'Anonymous_provider_sync_top_output', fields: [{ name: 'output', value: 'foobar', array: false }], isAnon: true }
                ],
                [
                    'Anonymous_provider_sync_top_input',
                    { name: 'Anonymous_provider_sync_top_input', fields: [{ name: 'input', value: 'boolean', tsType: true, array: false }], isAnon: true }
                ]
            ]),
            yamlVersion: 'v2'
        });
    });
});
