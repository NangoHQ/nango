// Rewrites Connect UI's placeholder base path (baked in at build time) to the base path this
// deployment serves it under, so the built assets and router resolve relative to it.
//
// This MUST run once after `vite build` and before the bundle is served — the built assets are
// unusable until it does (they still contain the placeholder). It runs in two places today:
//   - the container entrypoint (packages/server/entrypoint.sh), before serving; and
//   - the connect_ui deploy workflow, before uploading to static hosting (e.g. connect.nango.dev).
//
// The base path comes from the environment (see resolveBasePath) and defaults to "/". Even a root
// deployment runs the replacement — it just rewrites the placeholder to "/", not a no-op.
//
// TODO(NAN-6242): confirm no self-hoster is already serving Connect UI from their own static
// hosting. If any are, they must add this rewrite step to their deploy before upgrading, and we
// should document it (the docs don't yet mention static hosting for Connect UI).

/* eslint-disable no-console -- startup CLI script; console output is the intended interface */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BASE_PATH_PLACEHOLDER, resolveBasePath } from './base-path.js';

const REWRITABLE = /\.(?:js|css|html)$/;

async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (REWRITABLE.test(entry.name)) {
            yield full;
        }
    }
}

async function main() {
    const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
    const basePath = resolveBasePath(process.env);

    let changed = 0;
    for await (const file of walk(distDir)) {
        const content = await readFile(file, 'utf8');
        if (!content.includes(BASE_PATH_PLACEHOLDER)) {
            continue;
        }
        // Function replacer so a `$` in the base path is inserted literally, not read as a
        // replacement pattern ($&, $1, ...).
        await writeFile(
            file,
            content.replaceAll(BASE_PATH_PLACEHOLDER, () => basePath)
        );
        changed++;
    }

    console.log(`[connect-ui] base path set to "${basePath}" (${changed} file(s) updated)`);
}

main().catch((err) => {
    console.error('[connect-ui] failed to set base path:', err);
    process.exit(1);
});
