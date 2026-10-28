import { createRequire } from 'node:module';
import path from 'node:path';

import * as z from 'zod';

import type * as Botbuilder from 'botbuilder';

const require = createRequire(import.meta.url);

type ZodCompat = {
    object: (shape: Record<string, unknown>) => object;
    string: () => unknown;
};

// botbuilder@4.23.3 calls Zod 3.25 `.nonstrict()` and reads `ZodError.errors`.
// The root override forces zod@4.6.7, which removed both. Vitest loads a separate CJS copy, so patch each one.
function installNonstrict(zod: ZodCompat) {
    const zodObjectProto = Object.getPrototypeOf(zod.object({})) as {
        nonstrict?: () => unknown;
        passthrough: () => unknown;
    };
    if (typeof zodObjectProto.nonstrict !== 'function') {
        zodObjectProto.nonstrict = function nonstrict(this: { passthrough(): unknown }) {
            return this.passthrough();
        };
    }
}

function installZodErrorErrors(zod: ZodCompat) {
    // Zod 4 constructs errors with $constructor, so the instance prototype is not ZodError.prototype.
    let sample: unknown;
    try {
        (zod.object({ a: zod.string() }) as { parse: (input: unknown) => unknown }).parse({ a: 1 });
    } catch (err) {
        sample = err;
    }
    if (!sample || typeof sample !== 'object') {
        return;
    }
    const proto = Object.getPrototypeOf(sample) as { errors?: unknown };
    if (!proto || Object.prototype.hasOwnProperty.call(proto, 'errors')) {
        return;
    }
    Object.defineProperty(proto, 'errors', {
        get(this: { issues: unknown }) {
            return this.issues;
        },
        configurable: true
    });
}

function installZod3Compat(zod: ZodCompat) {
    installNonstrict(zod);
    installZodErrorErrors(zod);
}

installZod3Compat(z as unknown as ZodCompat);
installZod3Compat(require('zod') as ZodCompat);

const botbuilderEntry = require.resolve('botbuilder');
const zodBesideBotbuilder = require.resolve('zod', { paths: [path.dirname(botbuilderEntry)] });
const loadedZod = require(zodBesideBotbuilder) as ZodCompat & { default?: ZodCompat };
installZod3Compat(loadedZod);
if (loadedZod.default && loadedZod.default !== loadedZod) {
    installZod3Compat(loadedZod.default);
}

const loaded = require(botbuilderEntry) as typeof Botbuilder & { default?: typeof Botbuilder };

// `import * as botbuilder` exposes `.default` as module.exports. esbuild compiles
// `import botbuilder from 'botbuilder'` to `require('botbuilder').default`.
if (!loaded.default) {
    Object.defineProperty(loaded, 'default', {
        value: loaded,
        enumerable: true,
        configurable: true
    });
}

export const botbuilder = loaded as typeof Botbuilder & { default: typeof Botbuilder };
