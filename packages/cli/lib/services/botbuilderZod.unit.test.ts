import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { installBotbuilderZodCompat } from './botbuilderZod.js';

const require = createRequire(import.meta.url);

describe('installBotbuilderZodCompat', () => {
    it('aliases nonstrict to passthrough on the zod copy botbuilder loads', () => {
        const botbuilderPath = require.resolve('botbuilder');
        installBotbuilderZodCompat(botbuilderPath);

        const zodPath = require.resolve('zod', { paths: [path.dirname(botbuilderPath)] });
        const zod = require(zodPath) as {
            object: (shape: { a: unknown }) => {
                nonstrict: () => { parse: (input: unknown) => { a: string; extra?: number } };
            };
            string: () => unknown;
        };

        expect(zod.object({ a: zod.string() }).nonstrict().parse({ a: 'x', extra: 1 })).toEqual({ a: 'x', extra: 1 });
    });

    it('aliases ZodError.errors to issues when Zod 4 removed it', () => {
        const botbuilderPath = require.resolve('botbuilder');
        installBotbuilderZodCompat(botbuilderPath);

        const zodPath = require.resolve('zod', { paths: [path.dirname(botbuilderPath)] });
        const zod = require(zodPath) as {
            object: (shape: { a: unknown }) => { parse: (input: unknown) => unknown };
            string: () => unknown;
            ZodError: { prototype: { errors?: unknown } };
        };

        let thrown: { errors?: { code?: string }[]; issues?: { code?: string }[] } | undefined;
        try {
            zod.object({ a: zod.string() }).parse({ a: 1 });
        } catch (err) {
            thrown = err as { errors?: { code?: string }[]; issues?: { code?: string }[] };
        }

        expect(thrown?.errors ?? thrown?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid_type' })]));
    });
});
