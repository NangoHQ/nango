import { expect, describe, it } from 'vitest';
import { NangoYamlParserV2 } from './parser.v2.js';
import type { NangoYamlParsed, NangoYamlV2 } from '@nangohq/types';
import {
    ParserErrorBothPostConnectionScriptsAndOnEventsPresent,
    ParserErrorDuplicateEndpoint,
    ParserErrorMissingId,
    ParserErrorModelIsLiteral,
    ParserErrorModelNotFound
} from './errors.js';

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
        const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
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
                            endpoints: [{ method: 'GET', path: '/provider/top' }],
                            input: 'GithubIssue',
                            name: 'top',
                            output: ['GithubIssue'],
                            runs: 'every day',
                            scopes: [],
                            sync_type: 'full',
                            track_deletes: false,
                            type: 'sync',
                            usedModels: ['GithubIssue'],
                            webhookSubscriptions: [],
                            version: ''
                        }
                    ],
                    onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [] },
                    actions: [
                        {
                            description: '',
                            input: 'Anonymous_provider_action_createIssue_input',
                            endpoint: { method: 'POST', path: '/test' },
                            name: 'createIssue',
                            output: ['GithubIssue'],
                            scopes: [],
                            type: 'action',
                            usedModels: ['GithubIssue', 'Anonymous_provider_action_createIssue_input'],
                            version: ''
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

    it('should handle recursive model through model', () => {
        const v2: NangoYamlV2 = {
            models: { Start: { ref: 'Middle' }, Middle: { ref: 'End' }, End: { ref: 'Start' } },
            integrations: {
                provider: {
                    actions: { createIssue: { endpoint: '/test', output: 'Start' } }
                }
            }
        };
        const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
        parser.parse();
        expect(parser.errors).toStrictEqual([]);
        expect(parser.parsed).toStrictEqual<NangoYamlParsed>({
            integrations: [
                {
                    providerConfigKey: 'provider',
                    syncs: [],
                    onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [] },
                    actions: [
                        {
                            description: '',
                            input: null,
                            endpoint: { method: 'POST', path: '/test' },
                            name: 'createIssue',
                            output: ['Start'],
                            scopes: [],
                            type: 'action',
                            usedModels: ['Start', 'Middle', 'End'],
                            version: ''
                        }
                    ]
                }
            ],
            models: new Map([
                ['End', { name: 'End', fields: [{ array: false, model: true, name: 'ref', optional: false, value: 'Start' }] }],
                ['Middle', { name: 'Middle', fields: [{ array: false, model: true, name: 'ref', optional: false, value: 'End' }] }],
                ['Start', { name: 'Start', fields: [{ array: false, model: true, name: 'ref', optional: false, value: 'Middle' }] }]
            ]),
            yamlVersion: 'v2'
        });
    });

    it('should handle input / output as literal', () => {
        const v2: NangoYamlV2 = {
            models: {},
            integrations: { provider: { syncs: { top: { runs: 'every day', input: 'boolean', output: 'foobar', endpoint: 'GET /provider/top' } } } }
        };
        const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
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
                            endpoints: [{ method: 'GET', path: '/provider/top' }],
                            input: 'Anonymous_provider_sync_top_input',
                            name: 'top',
                            output: ['Anonymous_provider_sync_top_output'],
                            runs: 'every day',
                            scopes: [],
                            sync_type: 'full',
                            track_deletes: false,
                            type: 'sync',
                            usedModels: ['Anonymous_provider_sync_top_output', 'Anonymous_provider_sync_top_input'],
                            webhookSubscriptions: [],
                            version: ''
                        }
                    ],
                    onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [] },
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
        const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
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
            const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
            parser.parse();
            expect(parser.errors).toStrictEqual([]);
            expect(parser.warnings).toStrictEqual([]);
            expect(parser.parsed?.integrations[0]?.actions).toMatchObject([
                {
                    endpoint: { method: 'GET', path: '/ticketing/tickets/{Found:id}' }
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
            const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
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
            const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
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
            const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
            parser.parse();
            expect(parser.errors).toStrictEqual([]);
            expect(parser.warnings).toStrictEqual([]);
        });

        it('should handle endpoint new format (single)', () => {
            const v2: NangoYamlV2 = {
                models: { Found: { id: 'string' } },
                integrations: {
                    provider: { actions: { getGithubIssue: { endpoint: { method: 'POST', path: '/ticketing/tickets/{Found:id}' } } } }
                }
            };
            const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
            parser.parse();
            expect(parser.errors).toStrictEqual([]);
            expect(parser.warnings).toStrictEqual([]);
            expect(parser.parsed?.integrations[0]?.actions).toMatchObject([
                {
                    endpoint: { method: 'POST', path: '/ticketing/tickets/{Found:id}' }
                }
            ]);
        });

        it('should handle endpoint new format (array)', () => {
            const v2: NangoYamlV2 = {
                models: { Input: { id: 'string' }, Top: { id: 'string' }, Tip: { id: 'string' } },
                integrations: {
                    provider: {
                        syncs: {
                            top: {
                                runs: 'every day',
                                input: 'Input',
                                output: ['Top', 'Tip'],
                                endpoint: [
                                    { method: 'GET', path: '/provider/top' },
                                    { path: '/provider/tip', group: 'Record' }
                                ]
                            }
                        }
                    }
                }
            };
            const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
            parser.parse();
            expect(parser.errors).toStrictEqual([]);
            expect(parser.warnings).toStrictEqual([]);
            expect(parser.parsed?.integrations[0]?.syncs).toMatchObject([
                {
                    endpoints: [
                        { method: 'GET', path: '/provider/top' },
                        { method: 'GET', path: '/provider/tip', group: 'Record' }
                    ]
                }
            ]);
        });
    });
    it('should error if both post-connection-scripts and on-events are present', () => {
        const v2: NangoYamlV2 = {
            models: {},
            integrations: {
                provider: {
                    'post-connection-scripts': ['test'],
                    'on-events': { 'post-connection-creation': ['test'] }
                }
            }
        };
        const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
        parser.parse();
        expect(parser.errors).toStrictEqual([new ParserErrorBothPostConnectionScriptsAndOnEventsPresent({ path: ['provider', 'on-events'] })]);
        expect(parser.warnings).toStrictEqual([]);
    });
    it('should handle post-connection-scripts', () => {
        const v2: NangoYamlV2 = {
            models: {},
            integrations: { provider: { 'post-connection-scripts': ['test'] } }
        };
        const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
        parser.parse();
        expect(parser.errors).toStrictEqual([]);
        expect(parser.warnings).toStrictEqual([]);
        expect(parser.parsed?.integrations[0]?.postConnectionScripts).toStrictEqual(['test']);
    });
    it('should handle on-events', () => {
        const v2: NangoYamlV2 = {
            models: {},
            integrations: { provider: { 'on-events': { 'post-connection-creation': ['test1', 'test2'], 'pre-connection-deletion': ['test3', 'test4'] } } }
        };
        const parser = new NangoYamlParserV2({ raw: v2, yaml: '' });
        parser.parse();
        expect(parser.errors).toStrictEqual([]);
        expect(parser.warnings).toStrictEqual([]);
        expect(parser.parsed?.integrations[0]?.onEventScripts).toStrictEqual({
            'post-connection-creation': ['test1', 'test2'],
            'pre-connection-deletion': ['test3', 'test4']
        });
    });
});
