// Rewrites Connect UI's placeholder base path (baked in at build time) to the base path this
// deployment serves it under, so the built assets resolve relative to a non-root path.
//
// Run once before serving the static bundle. The container entrypoint runs it automatically;
// operators who serve `dist/` from their own static hosting run it themselves before uploading.
// The base path is derived from the environment (see resolveBasePath) and defaults to "/", so
// this is a no-op for root deployments.

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
