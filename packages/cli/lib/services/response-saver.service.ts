import fs from 'node:fs';
import path from 'node:path';
import type { AxiosResponse } from 'axios';
import type { Connection } from '@nangohq/shared';
import type { Metadata, UserProvidedProxyConfiguration } from '@nangohq/types';

function ensureDirectoryExists(directoryName: string): void {
    if (!fs.existsSync(directoryName)) {
        fs.mkdirSync(directoryName, { recursive: true });
    }
}

export function saveResponse<T>({
    directoryName,
    config,
    data,
    customFilePath
}: {
    directoryName: string;
    config: { method: string; endpoint: UserProvidedProxyConfiguration['endpoint'] };
    data: T;
    customFilePath?: string;
}): void {
    ensureDirectoryExists(`${directoryName}/mocks`);

    let filePath: string;
    if (customFilePath) {
        filePath = path.join(directoryName, customFilePath);
        ensureDirectoryExists(path.dirname(filePath));
    } else {
        const fileName = config.endpoint.replace('/', '');
        filePath = `${directoryName}/mocks/${config.method?.toLowerCase()}/${fileName}.json`;
        ensureDirectoryExists(path.dirname(filePath));
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function onAxiosRequestFulfilled({
    response,
    providerConfigKey,
    connectionId,
    syncName
}: {
    response: AxiosResponse;
    providerConfigKey: string | undefined;
    connectionId: string;
    syncName: string;
}): AxiosResponse {
    if (!providerConfigKey) {
        return response;
    }
    const directoryName = `${process.env['NANGO_MOCKS_RESPONSE_DIRECTORY'] ?? ''}${providerConfigKey}`;
    const method = response.config.method?.toLowerCase() || 'get';

    if (response.request.path.includes(`/connection/${connectionId}?provider_config_key=${providerConfigKey}`)) {
        const connection = response.data as Connection;

        // getConnection could be getMetadata as well which would be cached
        saveResponse<Pick<Connection, 'metadata' | 'connection_config'>>({
            directoryName,
            config: { endpoint: 'getConnection', method },
            data: { metadata: connection.metadata as Metadata, connection_config: connection.connection_config },
            customFilePath: 'mocks/nango/getConnection.json'
        });

        saveResponse<Metadata>({
            directoryName,
            config: { endpoint: 'getConnection', method },
            data: connection.metadata as Metadata,
            customFilePath: 'mocks/nango/getMetadata.json'
        });

        return response;
    }

    const pathname = response.request.path.split('?')[0];
    const strippedPath = pathname.replace('/', '');

    saveResponse<AxiosResponse>({
        directoryName,
        config: { endpoint: pathname, method },
        data: response.data,
        customFilePath: `mocks/nango/${method}/${strippedPath}/${syncName}.json`
    });

    return response;
}
