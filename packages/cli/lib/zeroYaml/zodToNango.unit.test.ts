import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { zodToNangoModelField } from './zodToNango.js';

describe('zodToNango', () => {
    it('should transform stuff', () => {
        const ref = z.object({ id: z.string() });
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
                    reco: z.record(z.string(), z.date()),
                    opt: z.any().optional(),
                    ref: ref,
                    void: z.void(),
                    never: z.never(),
                    date: z.date()
                    // Not supported
                    // lazy: z.lazy(() => ref)
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
                    value: [{ dynamic: true, name: '__string', optional: false, tsType: true, value: 'Date' }]
                },
                { name: 'opt', optional: true, tsType: true, value: 'any' },
                {
                    name: 'ref',
                    optional: false,
                    value: [{ name: 'id', optional: false, tsType: true, value: 'string' }]
                },
                { name: 'void', optional: true, tsType: true, value: 'void' },
                { name: 'never', optional: false, tsType: true, value: 'never' },
                { name: 'date', optional: false, tsType: true, value: 'Date' }
            ]
        });
    });
});
