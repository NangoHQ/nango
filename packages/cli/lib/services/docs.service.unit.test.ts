import { describe, expect, it } from 'vitest';

import { modelToJson } from './docs.service.js';

import type { JSONSchema7Definition } from 'json-schema';

describe('modelToJson', () => {
    it('should convert a model to a JSON object', () => {
        const jsonSchema: { name: string; def: JSONSchema7Definition }[] = [
            {
                name: 'User',
                def: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        arr: { type: 'array', items: { type: 'string' } },
                        arr2: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
                        ref: { type: 'object', $ref: '#/definitions/Profile' },
                        obj: { type: 'object', properties: { name: { type: 'string' } } },
                        enum: { type: 'string', enum: ['a', true, 'c'] },
                        union: { anyOf: [{ type: 'string' }, { type: 'number' }] },
                        width: { type: ['number', 'null'] }
                    },
                    required: ['id', 'name', 'arr', 'arr2', 'ref', 'obj', 'enum', 'union']
                }
            },
            {
                name: 'Profile',
                def: {
                    type: 'object',
                    properties: {
                        bio: { type: 'string' }
                    },
                    required: ['bio']
                }
            }
        ];
        const result = modelToJson({ model: jsonSchema[0]!.def, models: jsonSchema });
        expect(result).toEqual({
            id: '<string>',
            arr: '<string[]>',
            arr2: [{ ['name?']: '<string>' }],
            name: '<string>',
            enum: "<enum: 'a' | 'true' | 'c'>",
            union: '<<string> | <number>>',
            ref: { bio: '<string>' },
            obj: {
                ['name?']: '<string>'
            },
            ['width?']: '<number | null>'
        });
    });
});
