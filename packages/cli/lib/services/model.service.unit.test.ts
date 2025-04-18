import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildModelsTS, fieldToTypescript, fieldsToTypescript, getExportToJSON } from './model.service.js';
import type { NangoModel } from '@nangohq/types';
import { parse } from './config.service.js';
import { removeVersion } from '../tests/helpers.js';

describe('buildModelTs', () => {
    it('should return empty (with sdk)', () => {
        const res = buildModelsTS({ parsed: { yamlVersion: 'v2', integrations: [], models: new Map() } });
        expect(removeVersion(res)).toMatchSnapshot('');
    });

    it('should output all interfaces', () => {
        const models: NangoModel[] = [
            {
                name: 'Foo',
                fields: [
                    { name: '__string', value: 'string', tsType: true, dynamic: true },
                    { name: 'id', value: 'number', tsType: true }
                ]
            },
            {
                name: 'Bar',
                fields: [
                    { name: 'value', value: null, tsType: true },
                    { name: 'top', value: 'boolean', tsType: true, array: true },
                    { name: 'ref', value: 'Foo', tsType: false, model: true, optional: true },
                    {
                        name: 'union',
                        union: true,
                        value: [
                            { name: '0', value: 'literal1' },
                            { name: '1', value: 'literal2' }
                        ],
                        tsType: false
                    },
                    {
                        name: 'array',
                        array: true,
                        value: [
                            { name: '0', value: 'arr1' },
                            { name: '1', value: 'arr2' }
                        ],
                        tsType: false
                    },
                    {
                        name: 'obj',
                        value: [{ name: 'nes', value: 'ted' }]
                    }
                ]
            },
            {
                name: 'Anonymous_unauthenticated_action_returnType_input',
                fields: [{ name: 'input', value: 'number', tsType: true }],
                isAnon: true
            }
        ];
        const res = buildModelsTS({
            parsed: {
                yamlVersion: 'v2',
                models: new Map(Object.entries(models)),
                integrations: []
            }
        });
        expect(removeVersion(res.split('\n').slice(0, 25).join('\n'))).toMatchSnapshot('');
    });

    it('should support all advanced syntax', () => {
        const parsing = parse(path.resolve(__dirname, `../../fixtures/nango-yaml/v2/advanced-syntax`));
        if (parsing.isErr()) {
            throw parsing.error;
        }

        const res = buildModelsTS({ parsed: parsing.value.parsed! });
        const acc = [];
        for (const line of res.split('\n')) {
            if (line === '// ------ SDK') {
                break;
            }
            acc.push(line);
        }
        expect(removeVersion(acc.join('\n'))).toMatchSnapshot();
    });
});

describe('fieldsToTypescript', () => {
    it.each(['a-b', 'a!b', 'a@', 'a&', 'a#', 'a(', 'a)', 'a%'])('should handle exotic key name', (val) => {
        const res = fieldsToTypescript({ fields: [{ name: val, value: 'string' }] });
        expect(res[0]).toStrictEqual(`  "${val}": 'string';`);
    });
});

describe('fieldToTypescript', () => {
    it('should correctly interpret a string union literal type', () => {
        expect(
            fieldToTypescript({
                field: {
                    name: 'test',
                    union: true,
                    value: [
                        { name: '0', value: 'male' },
                        { name: '1', value: 'female' }
                    ]
                }
            })
        ).toStrictEqual("'male' | 'female'");
    });

    it('should correctly interpret a union literal type with all types', () => {
        expect(
            fieldToTypescript({
                field: {
                    name: 'test',
                    union: true,
                    value: [
                        { name: '0', value: 'male' },
                        { name: '1', value: 'string', tsType: true },
                        { name: '1', value: null, tsType: true },
                        { name: '2', value: 'undefined', tsType: true },
                        { name: '3', value: 1, tsType: true },
                        { name: '4', value: true, tsType: true }
                    ]
                }
            })
        ).toStrictEqual("'male' | string | null | undefined | 1 | true");
    });

    it('should correctly interpret a union literal with models', () => {
        expect(
            fieldToTypescript({
                field: {
                    name: 'test',
                    union: true,
                    value: [
                        { name: '0', value: 'User', model: true },
                        { name: '1', value: 'Account', model: true }
                    ]
                }
            })
        ).toStrictEqual('User | Account');
    });

    it('should correctly interpret a literal array', () => {
        expect(
            fieldToTypescript({
                field: {
                    name: 'test',
                    array: true,
                    value: [
                        { name: '0', value: 'User', model: true },
                        { name: '1', value: 'Account', model: true }
                    ]
                }
            })
        ).toStrictEqual('(User | Account)[]');
    });

    it('should correctly interpret a literal array', () => {
        expect(
            fieldToTypescript({
                field: {
                    name: 'test',
                    union: true,
                    value: [
                        { name: '0', value: 'User', model: true, array: true },
                        { name: '1', value: 'string', tsType: true }
                    ]
                }
            })
        ).toStrictEqual('User[] | string');
    });
});

describe('generate exports', () => {
    describe('json', () => {
        it('should export to JSON', () => {
            const folderTS = path.join(os.tmpdir(), 'cli-exports-json');
            fs.rmSync(folderTS, { recursive: true, force: true });
            fs.mkdirSync(folderTS, { recursive: true });
            const pathTS = path.join(folderTS, 'schema.ts');
            fs.writeFileSync(pathTS, `export interface Test { id: string; name: number[]; }`);

            const res = getExportToJSON({ pathTS });
            expect(removeVersion(JSON.stringify(res, null, 2))).toMatchSnapshot();
        });
    });
});
