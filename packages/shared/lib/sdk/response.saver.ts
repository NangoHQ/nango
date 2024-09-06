import fs from 'node:fs';
import path from 'node:path';
import type { ProxyConfiguration } from './sync.js';
import type { SyncConfig } from '../models/Sync.js';

function ensureDirectoryExists(directoryName: string): void {
    if (!fs.existsSync(directoryName)) {
        fs.mkdirSync(directoryName, { recursive: true });
    }
}

function getPaginateFilePath(directoryName: string, config: ProxyConfiguration, syncConfig?: SyncConfig): string {
    const paginateType = config.method?.toLowerCase() || 'get';
    const fileName = config.endpoint.replace('/', '');
    const paginatePath = `${directoryName}/mocks/paginate/${paginateType}/${syncConfig?.sync_name}`;

    ensureDirectoryExists(paginatePath);

    if (fileName.includes('/')) {
        const fileNameParts = fileName.split('/');
        fileNameParts.pop();
        const additionalPath = fileNameParts.join('/');
        fs.mkdirSync(`${paginatePath}/${additionalPath}`, { recursive: true });
    }

    return `${paginatePath}/${fileName}.json`;
}

export function saveResponse<T>({
    directoryName,
    config,
    data,
    syncConfig,
    customFilePath
}: {
    directoryName: string;
    config: ProxyConfiguration;
    data: T;
    syncConfig?: SyncConfig;
    customFilePath?: string;
}): void {
    ensureDirectoryExists(`${directoryName}/mocks`);

    let filePath: string;
    if (customFilePath) {
        filePath = path.join(directoryName, customFilePath);
        ensureDirectoryExists(path.dirname(filePath));
    } else {
        const fileName = config.endpoint.replace('/', '');
        filePath = config.paginate ? getPaginateFilePath(directoryName, config, syncConfig) : `${directoryName}/mocks/${fileName}.json`;
    }

    const responsePath = config.paginate?.response_path;
    const formattedData = responsePath ? (data as Record<string, unknown>)[responsePath] : data;

    fs.writeFileSync(filePath, JSON.stringify(formattedData, null, 2));
}
