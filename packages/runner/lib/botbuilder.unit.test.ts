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
        expect(botbuilder.default.BotFrameworkAdapter).toBe(botbuilder.BotFrameworkAdapter);
    });

    it('keeps Zod 3 ZodError.errors so botbuilder can report validation failures', () => {
        let thrown: unknown;
        try {
            z.object({ a: z.string() }).parse({ a: 1 });
        } catch (err) {
            thrown = err;
        }

        const zodError = thrown as { errors?: { code: string }[]; issues: { code: string }[] };
        expect(zodError.errors).toBe(zodError.issues);
        expect(new Error(JSON.stringify(zodError.errors, null, 2)).message).toContain('invalid_type');
    });

    it('includes validation details when botbuilder config is invalid', () => {
        expect(() => new botbuilder.ConfigurationBotFrameworkAuthentication({ CallerId: 1 as unknown as string })).toThrow(/CallerId/);
    });
});
