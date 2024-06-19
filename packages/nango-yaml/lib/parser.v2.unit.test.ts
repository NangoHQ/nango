import { expect, describe, it } from 'vitest';
import { NangoYamlParserV2 } from './parser.v2.js';
import type { NangoYamlParsed, NangoYamlV2 } from '@nangohq/types';
import { ParserErrorDuplicateEndpoint, ParserErrorMissingId, ParserErrorModelIsLiteral, ParserErrorModelNotFound } from './errors.js';

describe('parse', () => {
    it('should parse', () => {
        const v2: NangoYamlV2 = {
            models: { GithubIssue: { id: 'string' } },
            integrations: {
                provider: {
                    syncs: { top: { runs: 'every day', input: 'GithubIssue', output: 'GithubIssue', endpoint: 'GET /provider/top' } },
                    actions: { createIssue: { endpoint: '/test', input: 'string', output: 'GithubIssue' } }
                }
            }
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
                    actions: [
                        {
                            description: '',
                            input: 'Anonymous_provider_action_createIssue_input',
                            endpoint: { POST: '/test' },
                            name: 'createIssue',
                            output: ['GithubIssue'],
                            scopes: [],
                            type: 'action',
                            usedModels: ['GithubIssue', 'Anonymous_provider_action_createIssue_input']
                        }
                    ]
                }
            ],
            models: new Map([
                ['GithubIssue', { name: 'GithubIssue', fields: [{ name: 'id', value: 'string', tsType: true, array: false, optional: false }] }],
                [
                    'Anonymous_provider_action_createIssue_input',
                    {
                        fields: [{ array: false, name: 'input', optional: false, tsType: true, value: 'string' }],
                        isAnon: true,
                        name: 'Anonymous_provider_action_createIssue_input'
                    }
                ]
            ]),
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
        expect(parser.errors).toStrictEqual([
            new ParserErrorMissingId({ model: 'Anonymous_provider_sync_top_output', path: ['provider', 'syncs', 'top', '[output]'] })
        ]);
        expect(parser.warnings).toStrictEqual([new ParserErrorModelIsLiteral({ model: 'boolean', path: ['provider', 'syncs', 'top', '[input]'] })]);
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
                    { name: 'Anonymous_provider_sync_top_output', fields: [{ name: 'output', value: 'foobar', array: false, optional: false }], isAnon: true }
                ],
                [
                    'Anonymous_provider_sync_top_input',
                    {
                        name: 'Anonymous_provider_sync_top_input',
                        fields: [{ name: 'input', value: 'boolean', tsType: true, array: false, optional: false }],
                        isAnon: true
                    }
                ]
            ]),
            yamlVersion: 'v2'
        });
    });

    it('should handle input / output as union', () => {
        const v2: NangoYamlV2 = {
            models: {},
            integrations: {
                provider: { actions: { top: { input: 'string | undefined', output: 'null | true[]', endpoint: 'GET /provider/top' } } }
            }
        };
        const parser = new NangoYamlParserV2({ raw: v2 });
        parser.parse();
        expect(parser.errors).toStrictEqual([]);
        expect(parser.warnings).toStrictEqual([]);
        expect(parser.parsed).toMatchObject({
            models: new Map([
                [
                    'Anonymous_provider_action_top_output',
                    {
                        name: 'Anonymous_provider_action_top_output',
                        fields: [
                            {
                                name: 'output',
                                optional: false,
                                union: true,
                                value: [
                                    { array: false, name: '0', optional: false, tsType: true, value: null },
                                    { array: true, name: '1', optional: false, tsType: true, value: true }
                                ]
                            }
                        ],
                        isAnon: true
                    }
                ],
                [
                    'Anonymous_provider_action_top_input',
                    {
                        name: 'Anonymous_provider_action_top_input',
                        fields: [
                            {
                                name: 'input',
                                optional: false,
                                union: true,
                                value: [
                                    { array: false, name: '0', optional: false, tsType: true, value: 'string' },
                                    { array: false, name: '1', optional: false, tsType: true, value: 'undefined' }
                                ]
                            }
                        ],
                        isAnon: true
                    }
                ]
            ]),
            yamlVersion: 'v2'
        });
    });

    describe('endpoints', () => {
        it('should handle endpoint with model inside (found)', () => {
            const v2: NangoYamlV2 = {
                models: { Found: { id: 'string' } },
                integrations: {
                    provider: { actions: { getGithubIssue: { endpoint: 'GET /ticketing/tickets/{Found:id}' } } }
                }
            };
            const parser = new NangoYamlParserV2({ raw: v2 });
            parser.parse();
            expect(parser.errors).toStrictEqual([]);
            expect(parser.warnings).toStrictEqual([]);
            expect(parser.parsed?.integrations[0]?.actions).toMatchObject([
                {
                    endpoint: { GET: '/ticketing/tickets/{Found:id}' }
                }
            ]);
        });

        it('should handle endpoint with model inside (missing)', () => {
            const v2: NangoYamlV2 = {
                models: {},
                integrations: {
                    provider: { actions: { getGithubIssue: { endpoint: 'GET /ticketing/tickets/{Missing:id}' } } }
                }
            };
            const parser = new NangoYamlParserV2({ raw: v2 });
            parser.parse();
            expect(parser.errors).toStrictEqual([
                new ParserErrorModelNotFound({ model: 'Missing', path: ['provider', 'syncs', 'getGithubIssue', '[endpoint]'] })
            ]);
            expect(parser.warnings).toStrictEqual([]);
        });

        it('should raise an error if endpoint is reused in an integration', () => {
            const v2: NangoYamlV2 = {
                models: {},
                integrations: {
                    provider: { actions: { getGithubIssue: { endpoint: 'GET /issue' }, getTrelloIssue: { endpoint: 'GET /issue' } } }
                }
            };
            const parser = new NangoYamlParserV2({ raw: v2 });
            parser.parse();
            expect(parser.errors).toStrictEqual([
                new ParserErrorDuplicateEndpoint({ endpoint: 'GET /issue', path: ['provider', 'actions', 'getTrelloIssue', '[endpoint]'] })
            ]);
            expect(parser.warnings).toStrictEqual([]);
        });

        it('should not raise an error if endpoint is reused across many integration', () => {
            const v2: NangoYamlV2 = {
                models: {},
                integrations: {
                    providerA: { actions: { getGithubIssue: { endpoint: 'GET /issue' } } },
                    providerB: { actions: { getTrelloIssue: { endpoint: 'GET /issue' } } }
                }
            };
            const parser = new NangoYamlParserV2({ raw: v2 });
            parser.parse();
            expect(parser.errors).toStrictEqual([]);
            expect(parser.warnings).toStrictEqual([]);
        });
    });
});
