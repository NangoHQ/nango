import { createRequire } from 'node:module';
import path from 'node:path';

import type * as zod from 'zod';

const require = createRequire(import.meta.url);

// botbuilder@4.23.3 calls Zod 3.25 `.nonstrict()`, an alias of `.passthrough()` removed in Zod 4.
function installNonstrict(zodNs: typeof zod) {
    const zodObjectProto = Object.getPrototypeOf(zodNs.object({})) as {
        nonstrict?: () => unknown;
        passthrough: () => unknown;
    };
    if (typeof zodObjectProto.nonstrict !== 'function') {
        zodObjectProto.nonstrict = function nonstrict(this: { passthrough(): unknown }) {
            return this.passthrough();
        };
    }
}

/** Patch the zod copy botbuilder will load. Zod 3 already has `.nonstrict()`, so this is a no-op there. */
export function installBotbuilderZodCompat(botbuilderEntry: string): void {
    const zodPath = require.resolve('zod', { paths: [path.dirname(botbuilderEntry)] });
    const loaded = require(zodPath) as typeof zod & { default?: typeof zod };
    installNonstrict(loaded);
    if (loaded.default && loaded.default !== loaded) {
        installNonstrict(loaded.default);
    }
}
