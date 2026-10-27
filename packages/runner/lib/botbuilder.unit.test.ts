import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { botbuilder } from './botbuilder.js';

describe('botbuilder zod compat', () => {
    it('keeps unknown keys, matching Zod 3 nonstrict', () => {
        const schema = z.object({ a: z.string() }) as unknown as {
            nonstrict: () => { parse: (input: unknown) => { a: string; extra?: number } };
        };

        expect(schema.nonstrict().parse({ a: 'x', extra: 1 })).toEqual({ a: 'x', extra: 1 });
        expect(typeof botbuilder.BotFrameworkAdapter).toBe('function');
    });
});
