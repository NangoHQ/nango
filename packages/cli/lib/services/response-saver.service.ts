import fs from 'node:fs';
import path from 'node:path';
import type { AxiosResponse } from 'axios';
import type { Connection } from '@nangohq/shared';
import type { Metadata } from '@nangohq/types';

function ensureDirectoryExists(directoryName: string): void {
    if (!fs.existsSync(directoryName)) {
        fs.mkdirSync(directoryName, { recursive: true });
    }
}

export function saveResponse<T>({ directoryName, data, customFilePath }: { directoryName: string; data: T; customFilePath: string }): void {
    ensureDirectoryExists(`${directoryName}/mocks`);

    const filePath = path.join(directoryName, customFilePath);
    ensureDirectoryExists(path.dirname(filePath));

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
            data: { metadata: connection.metadata as Metadata, connection_config: connection.connection_config },
            customFilePath: 'mocks/nango/getConnection.json'
        });

        saveResponse<Metadata>({
            directoryName,
            data: connection.metadata as Metadata,
            customFilePath: 'mocks/nango/getMetadata.json'
        });

        return response;
    }

    const pathname = response.request.path.split('?')[0];
    const strippedPath = pathname.replace('/', '');

    saveResponse<AxiosResponse>({
        directoryName,
        data: response.data,
        customFilePath: `mocks/nango/${method}/${strippedPath}/${syncName}.json`
    });

    return response;
}
