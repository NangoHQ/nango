import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

type ZodCompat = {
    object: (shape: Record<string, unknown>) => object;
    string: () => unknown;
};

// botbuilder@4.23.3 calls Zod 3.25 `.nonstrict()` and reads `ZodError.errors`. Zod 4 removed both.
function installZod3Compat(zodNs: ZodCompat) {
    const zodObjectProto = Object.getPrototypeOf(zodNs.object({})) as {
        nonstrict?: () => unknown;
        passthrough: () => unknown;
    };
    if (typeof zodObjectProto.nonstrict !== 'function') {
        zodObjectProto.nonstrict = function nonstrict(this: { passthrough(): unknown }) {
            return this.passthrough();
        };
    }

    // Zod 4 constructs errors with $constructor, so the instance prototype is not ZodError.prototype.
    let sample: unknown;
    try {
        (zodNs.object({ a: zodNs.string() }) as { parse: (input: unknown) => unknown }).parse({ a: 1 });
    } catch (err) {
        sample = err;
    }
    if (!sample || typeof sample !== 'object') {
        return;
    }
    const errorProto = Object.getPrototypeOf(sample) as { errors?: unknown };
    if (!errorProto || Object.prototype.hasOwnProperty.call(errorProto, 'errors')) {
        return;
    }
    Object.defineProperty(errorProto, 'errors', {
        get(this: { issues: unknown }) {
            return this.issues;
        },
        configurable: true
    });
}

/** Patch the zod copy botbuilder will load. Zod 3 already has these, so this is a no-op there. */
export function installBotbuilderZodCompat(botbuilderEntry: string): void {
    const zodPath = require.resolve('zod', { paths: [path.dirname(botbuilderEntry)] });
    const loaded = require(zodPath) as ZodCompat & { default?: ZodCompat };
    installZod3Compat(loaded);
    if (loaded.default && loaded.default !== loaded) {
        installZod3Compat(loaded.default);
    }
}
