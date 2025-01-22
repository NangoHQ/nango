import { describe, expect, it } from 'vitest';
import { zodToNangoModelField } from './zodToNango.js';
import { z } from 'zod';

describe('zodToNango', () => {
    it('should transform stuff', () => {
        expect(
            zodToNangoModelField(
                'test',
                z.object({
                    foo: z.literal('bar'),
                    num: z.number(),
                    bool: z.boolean(),
                    null: z.null(),
                    enum: z.enum(['tip', 'top']),
                    arr: z.array(z.string()),
                    obj: z.object({ bar: z.string() }),
                    union: z.union([z.string(), z.boolean()]),
                    any: z.any(),
                    reco: z.record(z.string(), z.date())
                })
            )
        ).toStrictEqual({
            name: 'test',
            optional: false,
            value: [
                { name: 'foo', optional: false, value: 'bar' },
                { name: 'num', optional: false, tsType: true, value: 'number' },
                { name: 'bool', optional: false, tsType: true, value: 'boolean' },
                { name: 'null', optional: false, tsType: true, value: null },
                {
                    name: 'enum',
                    optional: false,
                    union: true,
                    value: [
                        { name: '0', value: 'tip' },
                        { name: '1', value: 'top' }
                    ]
                },
                { array: true, name: 'arr', optional: false, tsType: true, value: 'string' },
                {
                    name: 'obj',
                    optional: false,
                    value: [{ name: 'bar', optional: false, tsType: true, value: 'string' }]
                },
                {
                    name: 'union',
                    optional: false,
                    tsType: true,
                    union: true,
                    value: [
                        { name: '0', optional: false, tsType: true, value: 'string' },
                        { name: '1', optional: false, tsType: true, value: 'boolean' }
                    ]
                },
                { name: 'any', optional: true, tsType: true, value: 'any' },
                {
                    name: 'reco',
                    optional: false,
                    value: [{ dynamic: true, name: '__string', optional: false, tsType: true, value: 'date' }]
                }
            ]
        });
    });
});
