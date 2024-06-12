import { describe, expect, it } from 'vitest';
import { buildModelsTS, fieldToTypescript } from './model.service.js';
import type { ParsedNangoAction, ParsedNangoSync } from '@nangohq/types';

const defaultSync: ParsedNangoSync = {
    name: 'default',
    type: 'sync',
    description: '',
    auto_start: false,
    input: null,
    nango_yaml_version: 'v2',
    runs: '',
    endpoints: [{ POST: '/default' }],
    layout_mode: 'root',
    models: [],
    scopes: [],
    sync_type: 'full',
    track_deletes: false,
    webhookSubscriptions: []
};
const defaultAction: ParsedNangoAction = {
    name: 'default',
    type: 'action',
    description: '',
    endpoint: { POST: '/default' },
    models: [],
    input: null,
    nango_yaml_version: 'v2',
    scopes: []
};

describe('buildModelTs', () => {
    it('should return empty (with sdk)', () => {
        const res = buildModelsTS({ parsed: { yamlVersion: 'v2', integrations: [], models: new Map() } });
        expect(res).toMatchSnapshot('');
    });

    it('should output all interfaces', () => {
        const res = buildModelsTS({
            parsed: {
                yamlVersion: 'v2',
                models: new Map(),
                integrations: [
                    {
                        providerConfigKey: 'foobar',
                        actions: [
                            {
                                ...defaultAction,
                                name: 'Action1',
                                returns: ['Action1'],
                                models: [{ name: 'Action1', fields: [{ name: 'name', value: 'dfd' }] }]
                            }
                        ],
                        syncs: [
                            {
                                ...defaultSync,
                                name: 'Sync1',
                                returns: ['Sync1'],
                                models: [{ name: 'Sync1', fields: [{ name: 'id', value: 'dfd' }] }]
                            }
                        ]
                    }
                ]
            }
        });
        expect(res.split('\n').slice(0, 15)).toMatchSnapshot('');
    });

    it('should support [key: string] model', () => {
        const res = buildModelsTS({
            parsed: {
                yamlVersion: 'v2',
                models: new Map(),
                integrations: [
                    {
                        providerConfigKey: 'foobar',
                        actions: [],
                        syncs: [
                            {
                                ...defaultSync,
                                models: [
                                    {
                                        name: 'Sync1',
                                        fields: [
                                            { name: '[key: string]', value: 'string' },
                                            { name: 'id', value: 'string' }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        });

        expect(res.split('\n').slice(0, 15)).toMatchSnapshot();
    });
});

describe('fieldToTypescript', () => {
    it('should correctly interpret a string union literal type', () => {
        expect(fieldToTypescript({ rawField: 'male | female', modelName: 'gender', models: new Map() })).toStrictEqual("'male' | 'female'");
    });

    it('should correctly interpret a union literal type with a string and a primitive', () => {
        expect(fieldToTypescript({ rawField: 'male | null', modelName: 'gender', models: new Map() })).toStrictEqual("'male' | null");
    });

    it('should correctly interpret a union literal with models', () => {
        const models = new Map([
            ['User', {}],
            ['Account', {}]
        ]);
        expect(fieldToTypescript({ rawField: 'User | Account', modelName: 'user', models })).toStrictEqual('User | Account');
    });

    it('should correctly interpret a union literal with string and model', () => {
        const models = new Map([['Other', {}]]);
        expect(fieldToTypescript({ rawField: 'male | Other', modelName: 'user', models })).toStrictEqual("'male' | Other");
    });

    it('should correctly interpret a union with Date ', () => {
        expect(fieldToTypescript({ rawField: 'Date | null', modelName: 'user', models: new Map() })).toStrictEqual('Date | null');
    });

    it('should correctly interpret a union with undefined', () => {
        expect(fieldToTypescript({ rawField: 'male | string | undefined | null', modelName: 'user', models: new Map() })).toStrictEqual(
            "'male' | string | undefined | null"
        );
    });

    it('should correctly interpret an literal array', () => {
        expect(fieldToTypescript({ rawField: 'string[]', modelName: 'user', models: new Map() })).toStrictEqual('string[]');
    });

    it('should correctly interpret a model array', () => {
        const models = new Map([
            ['User', {}],
            ['Account', {}]
        ]);
        expect(fieldToTypescript({ rawField: 'Account[]', modelName: 'user', models })).toStrictEqual('Account[]');
    });

    it('should correctly interpret a union type with an array model', () => {
        const models = new Map([
            ['User', {}],
            ['Account', {}]
        ]);
        expect(fieldToTypescript({ rawField: 'User[] | null', modelName: 'user', models })).toStrictEqual('User[] | null');
        expect(fieldToTypescript({ rawField: 'User[] | Account[]', modelName: 'user', models })).toStrictEqual('User[] | Account[]');
    });
});
