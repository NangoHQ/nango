import { createRequire } from 'node:module';

import * as z from 'zod';

import type * as Botbuilder from 'botbuilder';

const require = createRequire(import.meta.url);

// botbuilder@4.23.3 calls Zod 3 `.nonstrict()`, an alias of `.strip()` removed in Zod 4.
// The root override forces zod@4.6.7. Vitest loads a separate CJS copy, so patch both.
function installNonstrict(zod: typeof z) {
    const zodObjectProto = Object.getPrototypeOf(zod.object({})) as {
        nonstrict?: () => unknown;
        strip: () => unknown;
    };
    if (typeof zodObjectProto.nonstrict !== 'function') {
        zodObjectProto.nonstrict = function nonstrict(this: { strip(): unknown }) {
            return this.strip();
        };
    }
}

installNonstrict(z);
installNonstrict(require('zod') as typeof z);

export const botbuilder = require('botbuilder') as typeof Botbuilder;
