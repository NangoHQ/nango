import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

export const fixturesPath = './packages/cli/fixtures';

export async function copyDirectoryAndContents(source: string, destination: string) {
    await fs.mkdir(destination, { recursive: true });

    const files = await fs.readdir(source, { withFileTypes: true });

    for (const file of files) {
        const sourcePath = path.join(source, file.name);
        const destinationPath = path.join(destination, file.name);

        if (file.isDirectory()) {
            await copyDirectoryAndContents(sourcePath, destinationPath);
        } else {
            await fs.copyFile(sourcePath, destinationPath);
        }
    }
}

export function removeVersion(res: string) {
    return res.replace(/(v[0-9.]+)/, 'vTest');
}

export async function getTestDirectory(name: string) {
    const dir = path.join(os.tmpdir(), name, 'nango-integrations');
    await fs.mkdir(dir, { recursive: true });
    await fs.rm(dir, { recursive: true, force: true });
    return dir;
}
