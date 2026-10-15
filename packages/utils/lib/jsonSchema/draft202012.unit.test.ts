import { describe, expect, it } from 'vitest';

import { draft07ToDraft202012 } from './draft202012.js';

import type { JSONSchema7 } from 'json-schema';

describe('draft07ToDraft202012', () => {
    it('moves definitions to $defs and repoints refs at them', () => {
        expect(
            draft07ToDraft202012({
                $schema: 'http://json-schema.org/draft-07/schema#',
                definitions: {
                    Page: { type: 'object', properties: { parent: { $ref: '#/definitions/Page' }, icon: { $ref: '#/definitions/Icon/properties/emoji' } } },
                    Icon: { type: 'object', properties: { emoji: { type: 'string' } } }
                },
                $ref: '#/definitions/Page'
            })
        ).toStrictEqual({
            $defs: {
                Page: { type: 'object', properties: { parent: { $ref: '#/$defs/Page' }, icon: { $ref: '#/$defs/Icon/properties/emoji' } } },
                Icon: { type: 'object', properties: { emoji: { type: 'string' } } }
            },
            $ref: '#/$defs/Page'
        });
    });

    it('turns a tuple into prefixItems with additionalItems as items', () => {
        expect(draft07ToDraft202012({ type: 'array', items: [{ type: 'string' }, { type: 'number' }], additionalItems: false })).toStrictEqual({
            type: 'array',
            prefixItems: [{ type: 'string' }, { type: 'number' }],
            items: false
        });
        expect(draft07ToDraft202012({ type: 'array', items: [{ type: 'string' }] })).toStrictEqual({ type: 'array', prefixItems: [{ type: 'string' }] });
    });

    it('drops additionalItems next to a single items schema, where draft-07 ignores it', () => {
        expect(draft07ToDraft202012({ type: 'array', items: { type: 'string' }, additionalItems: false })).toStrictEqual({
            type: 'array',
            items: { type: 'string' }
        });
    });

    it('splits dependencies into dependentRequired and dependentSchemas', () => {
        expect(draft07ToDraft202012({ dependencies: { a: ['b'], c: { required: ['d'] } } })).toStrictEqual({
            dependentRequired: { a: ['b'] },
            dependentSchemas: { c: { required: ['d'] } }
        });
    });

    it('walks every keyword that holds a subschema', () => {
        const ref = { $ref: '#/definitions/X' };
        const converted = { $ref: '#/$defs/X' };

        expect(
            draft07ToDraft202012({
                anyOf: [ref],
                oneOf: [ref],
                allOf: [ref],
                not: ref,
                if: ref,
                then: ref,
                else: ref,
                contains: ref,
                propertyNames: ref,
                additionalProperties: ref,
                patternProperties: { '^x': ref }
            })
        ).toStrictEqual({
            anyOf: [converted],
            oneOf: [converted],
            allOf: [converted],
            not: converted,
            if: converted,
            then: converted,
            else: converted,
            contains: converted,
            propertyNames: converted,
            additionalProperties: converted,
            patternProperties: { '^x': converted }
        });
    });

    it('leaves a property named like a keyword and schema-shaped values alone', () => {
        const schema: JSONSchema7 = {
            type: 'object',
            properties: { definitions: { type: 'string' }, items: { type: 'array', items: [{ type: 'string' }] } },
            const: { $ref: '#/definitions/X' },
            default: { items: [1] },
            enum: [{ definitions: {} }]
        };

        expect(draft07ToDraft202012(schema)).toStrictEqual({
            type: 'object',
            properties: { definitions: { type: 'string' }, items: { type: 'array', prefixItems: [{ type: 'string' }] } },
            const: { $ref: '#/definitions/X' },
            default: { items: [1] },
            enum: [{ definitions: {} }]
        });
    });

    it('keeps boolean schemas and refs that do not point at definitions', () => {
        expect(draft07ToDraft202012(true)).toBe(true);
        expect(draft07ToDraft202012({ properties: { self: { $ref: '#' }, never: false } })).toStrictEqual({
            properties: { self: { $ref: '#' }, never: false }
        });
    });
});
