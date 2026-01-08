import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { zodToNangoModelField } from './zodToNango.js';

describe('zodToNango', () => {
    it('should transform stuff', () => {
        const ref = z.object({ id: z.string() });
        expect(
            zodToNangoModelField(
                'test',
                z.object({
                    foo: z.literal('bar'),
                    literalArray: z.literal(['bar', 'baz']),
                    num: z.number(),
                    bigint: z.bigint(),
                    bool: z.boolean(),
                    null: z.null(),
                    enum: z.enum(['tip', 'top']),
                    arr: z.array(z.string()),
                    obj: z.object({ bar: z.string() }),
                    union: z.union([z.string(), z.boolean()]),
                    any: z.any(),
                    reco: z.record(z.string(), z.date()),
                    opt: z.any().optional(),
                    nullable: z.string().nullable(),
                    nullableOptional: z.string().nullable().optional(),
                    nullish: z.string().nullish(),
                    ref: ref,
                    void: z.void(),
                    never: z.never(),
                    date: z.date(),
                    emptyObject: z.object({}),
                    unknown: z.unknown(),
                    discriminatedUnion: z.discriminatedUnion('type', [
                        z.object({ type: z.literal('a'), foo: z.string() }),
                        z.object({ type: z.literal('b'), bar: z.string() })
                    ]),
                    coerce: z.coerce.string()

                    // Not supported yet
                    // email: z.email(), // Not supported yet by "ts-json-schema-generator" (2.4.0)
                    // url: z.url() // Not supported yet by "ts-json-schema-generator" (2.4.0)
                    // tuple: z.tuple([z.string(), z.number()]) // legacy model shape is blocking us

                    // Not supported on purpose
                    // undefined: z.undefined()
                    // lazy: z.lazy(() => ref)
                    // default: z.string().default(z.string())
                })
            )
        ).toStrictEqual({
            name: 'test',
            optional: false,
            description: undefined,
            value: [
                { name: 'foo', optional: false, value: 'bar', description: undefined },
                {
                    name: 'literalArray',
                    optional: false,
                    union: true,
                    value: [
                        { name: '0', value: 'bar', description: undefined },
                        { name: '1', value: 'baz', description: undefined }
                    ],
                    description: undefined
                },
                { name: 'num', optional: false, tsType: true, value: 'number', description: undefined },
                { name: 'bigint', optional: false, tsType: true, value: 'bigint', description: undefined },
                { name: 'bool', optional: false, tsType: true, value: 'boolean', description: undefined },
                { name: 'null', optional: false, tsType: true, value: null, description: undefined },
                {
                    name: 'enum',
                    optional: false,
                    union: true,
                    value: [
                        { name: '0', value: 'tip', description: undefined },
                        { name: '1', value: 'top', description: undefined }
                    ],
                    description: undefined
                },
                { array: true, name: 'arr', optional: false, tsType: true, value: 'string', description: undefined },
                {
                    name: 'obj',
                    optional: false,
                    value: [{ name: 'bar', optional: false, tsType: true, value: 'string', description: undefined }],
                    description: undefined
                },
                {
                    name: 'union',
                    optional: false,
                    tsType: true,
                    union: true,
                    value: [
                        { name: '0', optional: false, tsType: true, value: 'string', description: undefined },
                        { name: '1', optional: false, tsType: true, value: 'boolean', description: undefined }
                    ],
                    description: undefined
                },
                { name: 'any', optional: true, tsType: true, value: 'any', description: undefined },
                {
                    name: 'reco',
                    optional: false,
                    value: [{ dynamic: true, name: '__string', optional: false, tsType: true, value: 'Date', description: undefined }],
                    description: undefined
                },
                { name: 'opt', optional: true, tsType: true, value: 'any', description: undefined },
                { name: 'nullable', optional: false, tsType: true, value: 'string', description: undefined },
                { name: 'nullableOptional', optional: true, tsType: true, value: 'string', description: undefined },
                { name: 'nullish', optional: true, tsType: true, value: 'string', description: undefined },
                {
                    name: 'ref',
                    optional: false,
                    value: [{ name: 'id', optional: false, tsType: true, value: 'string', description: undefined }],
                    description: undefined
                },
                { name: 'void', tsType: true, value: 'void', description: undefined },
                { name: 'never', optional: false, tsType: true, value: 'never', description: undefined },
                { name: 'date', optional: false, tsType: true, value: 'Date', description: undefined },
                { name: 'emptyObject', optional: false, value: [], description: undefined },
                { name: 'unknown', optional: true, tsType: true, value: 'unknown', description: undefined },
                {
                    name: 'discriminatedUnion',
                    optional: false,
                    tsType: true,
                    union: true,
                    value: [
                        {
                            name: '0',
                            optional: false,
                            value: [
                                { name: 'type', optional: false, value: 'a', description: undefined },
                                { name: 'foo', optional: false, tsType: true, value: 'string', description: undefined }
                            ],
                            description: undefined
                        },
                        {
                            name: '1',
                            optional: false,
                            value: [
                                { name: 'type', optional: false, value: 'b', description: undefined },
                                { name: 'bar', optional: false, tsType: true, value: 'string', description: undefined }
                            ],
                            description: undefined
                        }
                    ],
                    description: undefined
                },
                { name: 'coerce', optional: true, tsType: true, value: 'string', description: undefined }

                // {
                //     name: 'tuple',
                //     optional: false,
                //     tsType: true,
                //     array: true,
                //     value: [
                //         { name: '0', optional: false, tsType: true, value: 'string' },
                //         { name: '1', optional: false, tsType: true, value: 'number' }
                //     ]
                // }
            ]
        });
    });

    it('should support nested objects', () => {
        const ref = z.object({ id: z.string() });
        expect(zodToNangoModelField('test', z.object({ foo: ref, arr: z.array(ref) }))).toStrictEqual({
            name: 'test',
            optional: false,
            value: [
                {
                    name: 'foo',
                    optional: false,
                    value: [{ name: 'id', optional: false, tsType: true, value: 'string', description: undefined }],
                    description: undefined
                },
                {
                    array: true,
                    name: 'arr',
                    optional: false,
                    value: [
                        {
                            name: '0',
                            optional: false,
                            value: [{ name: 'id', optional: false, tsType: true, value: 'string', description: undefined }],
                            description: undefined
                        }
                    ],
                    description: undefined
                }
            ],
            description: undefined
        });
    });
});
