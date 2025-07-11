import fs from 'node:fs';
import path from 'node:path';

import type { LayoutMode } from '@nangohq/types';

/*
 * Get Layout Mode
 * @desc determine if the layout mode is nested or root
 * 1. If the file exists in the root directory already then it is 'root'
 * 2. If the file exists in the nested path then it is 'nested'
 * 3. If an existing directory is found for that provider already then it is 'nested'
 * 4. If there are no files in the root directory at all then it should be
 * 'nested' since that is the new default
 * 5. If we're initializing then we should default to nested
 * 6. Fallback to nested
 */
export function getLayoutMode({
    fullPath,
    scriptName,
    providerConfigKey,
    type
}: {
    fullPath: string;
    scriptName: string;
    providerConfigKey: string;
    type: string;
}): LayoutMode {
    if (fs.existsSync(path.join(fullPath, `${scriptName}.ts`))) {
        return 'root';
    }

    const nestedPath = path.resolve(fullPath, `${providerConfigKey}/${type}s/${scriptName}.ts`);
    if (fs.existsSync(nestedPath)) {
        return 'nested';
    }

    const nestedProvider = path.resolve(fullPath, providerConfigKey);
    if (fs.existsSync(nestedProvider)) {
        return 'nested';
    }

    const rootPath = fs.realpathSync(path.join(fullPath, '/'));
    const files = fs.readdirSync(rootPath);
    if (files.length === 0) {
        return 'nested';
    }

    if (files.includes('nango-integrations')) {
        const nangoIntegrationsPath = path.resolve(rootPath, 'nango-integrations');
        const nangoFiles = fs.readdirSync(nangoIntegrationsPath);
        const expected = ['.env', 'models.ts', 'nango.yaml'];
        if (nangoFiles.length === 3 && expected.every((file) => nangoFiles.includes(file))) {
            return 'nested';
        }
    }

    return 'nested';
}
