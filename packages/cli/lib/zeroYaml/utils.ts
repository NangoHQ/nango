import fs from 'node:fs';
import path from 'node:path';

import { exampleFolder } from './constants.js';

export async function syncTsConfig({ fullPath }: { fullPath: string }) {
    await fs.promises.writeFile(path.join(fullPath, 'tsconfig.json'), await fs.promises.readFile(path.join(exampleFolder, 'tsconfig.json')));
}
