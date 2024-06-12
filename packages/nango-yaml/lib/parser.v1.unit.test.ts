import { expect, describe, it } from 'vitest';
import { NangoYamlParserV1 } from './parser.v1.js';
import type { NangoYamlParsed, NangoYamlV1 } from '@nangohq/types';
import { ParserErrorModelNotFound } from './errors.js';

describe('parse', () => {
    it('should parse', () => {
        const v1: NangoYamlV1 = {
            models: { GithubIssue: { id: 'string' } },
            integrations: { provider: { sync: { type: 'sync', runs: 'every day', returns: 'GithubIssue' } } }
        };
        const parser = new NangoYamlParserV1({ raw: v1 });
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
                            endpoints: [],
                            input: null,
                            name: 'sync',
                            output: ['GithubIssue'],
                            runs: 'every day',
                            scopes: [],
                            sync_type: 'incremental',
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
            yamlVersion: 'v1'
        });
    });

    it('should fail on missing model', () => {
        const v1: NangoYamlV1 = {
            models: {},
            integrations: { provider: { sync: { type: 'sync', runs: 'every day', returns: 'GithubIssue' } } }
        };
        const parser = new NangoYamlParserV1({ raw: v1 });
        parser.parse();
        expect(parser.errors).toStrictEqual([new ParserErrorModelNotFound({ model: 'GithubIssue', path: 'sync > sync' })]);
    });
});
