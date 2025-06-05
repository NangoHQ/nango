import fs from 'node:fs/promises';
import os from 'node:os';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const fixturesPath = path.resolve(__dirname, '../../fixtures');

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
