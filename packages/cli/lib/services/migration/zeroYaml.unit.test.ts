import { describe, expect, it } from 'vitest';

import * as zeroYaml from './zeroYaml.js';

import type { NangoModel } from '@nangohq/types';

describe('transformSync', () => {
    it('should create a .v2.ts file with createSync and correct properties', () => {
        const ts = `export default async function fetchData(nango) {\n  await nango.log('hello');\n}`;
        const result = zeroYaml.transformSync({
            content: ts,
            sync: {
                type: 'sync',
                name: 'test',
                description: 'Test sync',
                version: '1.2.3',
                runs: 'every hour',
                auto_start: true,
                sync_type: 'full',
                track_deletes: false,
                scopes: ['repo', 'user'],
                endpoints: [{ method: 'GET', path: 'top', group: 'foobar' }],
                usedModels: ['Metadata', 'Model', 'ModelDynamic'],
                webhookSubscriptions: ['*'],
                input: 'Metadata',
                output: ['Model', 'ModelDynamic']
            },
            models: new Map<string, NangoModel>([
                [
                    'Model',
                    {
                        name: 'Model',
                        fields: [
                            { name: 'id', value: 'string', tsType: true },
                            { name: 'arrTsType', value: 'string', tsType: true, array: true },
                            { name: 'null', value: 'null', tsType: true },
                            { name: 'bool', optional: false, tsType: true, value: 'boolean' },
                            { name: 'any', tsType: true, value: 'any' },
                            { name: 'opt', value: 'number', tsType: true, optional: true },
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
                            { name: 'obj', value: [{ name: 'nes', value: 'ted' }] },
                            {
                                name: 'dynamicObj',
                                optional: false,
                                value: [{ dynamic: true, name: '__string', optional: false, tsType: true, value: 'date' }]
                            }
                        ]
                    }
                ],
                [
                    'ModelDynamic',
                    {
                        name: 'ModelDynamic',
                        fields: [
                            { dynamic: true, name: '__string', optional: false, tsType: true, value: 'string' },
                            { name: 'id', optional: false, tsType: true, value: 'string' }
                        ]
                    }
                ],
                [
                    'Metadata',
                    {
                        name: 'Metadata',
                        fields: [{ name: 'foo', value: 'bar' }]
                    }
                ]
            ])
        });
        expect(result).toMatchSnapshot();
    });
});
