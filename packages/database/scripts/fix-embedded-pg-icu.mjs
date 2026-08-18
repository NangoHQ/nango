// @embedded-postgres/darwin-* ships fully-versioned dylibs (libzstd.1.5.7.dylib) but some
// binaries reference major-only names (libzstd.1.dylib), which dyld can't resolve.
// Create the missing major-version symlinks.
import { readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

for (const platform of ['darwin-arm64', 'darwin-x64']) {
    const libDir = join(process.cwd(), 'node_modules', '@embedded-postgres', platform, 'native', 'lib');
    let files;
    try {
        files = readdirSync(libDir);
    } catch {
        continue; // platform package not installed
    }
    for (const f of files) {
        // libfoo.1.5.7.dylib -> libfoo.1.dylib
        const m = f.match(/^(lib.+)\.(\d+)\.\d+(\.\d+)?\.dylib$/);
        if (!m) continue;
        for (const link of [join(libDir, `${m[1]}.${m[2]}.dylib`), join(libDir, `${m[1]}.dylib`)]) {
            try {
                symlinkSync(f, link);
            } catch (err) {
                if (err.code !== 'EEXIST') throw err;
            }
        }
    }
}
