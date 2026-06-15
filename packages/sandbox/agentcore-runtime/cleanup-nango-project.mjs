#!/usr/bin/env node

// `nango init --copy` gives us the CLI-maintained project shape. This strips
// the sample integration output so each runtime session starts with a clean
// zero-yaml workspace for files written by the sandbox provider.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectDir = process.argv[2];

if (!projectDir) {
    console.error('Usage: cleanup-nango-project.mjs <project-dir>');
    process.exit(1);
}

const filesToRemove = ['build', 'github', '.nango/nango.json', '.nango/schema.json', '.nango/schema.ts'];

const indexContents = `// Register Nango functions with side-effect imports.
// Example: import './github/actions/my-action.js';
`;

const envLinesToEnsure = ['NANGO_CLI_UPGRADE_MODE=ignore'];

await Promise.all(
    filesToRemove.map(async (relativePath) => {
        await fs.rm(path.join(projectDir, relativePath), { force: true, recursive: true });
    })
);

await fs.writeFile(path.join(projectDir, 'index.ts'), indexContents);

const envPath = path.join(projectDir, '.env');
const currentEnv = await fs.readFile(envPath, 'utf8');
const nextEnv = envLinesToEnsure.reduce((contents, line) => {
    return contents.includes(line) ? contents : `${contents.trimEnd()}\n${line}\n`;
}, currentEnv);

if (nextEnv !== currentEnv) {
    await fs.writeFile(envPath, nextEnv);
}
