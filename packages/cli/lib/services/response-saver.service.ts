import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AxiosResponse } from 'axios';
import type { Connection } from '@nangohq/shared';
import type { Metadata } from '@nangohq/types';

const FILTER_HEADERS = ['authorization', 'user-agent', 'nango-proxy-user-agent', 'accept-encoding', 'retries', 'host'];

interface CachedRequest {
    requestIdentityHash: string;
    requestIdentity: unknown[];
    data: unknown;
}

export function ensureDirectoryExists(directoryName: string): void {
    if (!fs.existsSync(directoryName)) {
        fs.mkdirSync(directoryName, { recursive: true });
    }
}

function saveResponse<T>({
    directoryName,
    data,
    customFilePath,
    concatenateIfExists
}: {
    directoryName: string;
    data: T | T[];
    customFilePath: string;
    concatenateIfExists: boolean;
}): void {
    ensureDirectoryExists(`${directoryName}/mocks`);

    const filePath = path.join(directoryName, customFilePath);
    ensureDirectoryExists(path.dirname(filePath));

    if (fs.existsSync(filePath)) {
        const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (concatenateIfExists && Array.isArray(existingData) && Array.isArray(data)) {
            data = data.concat(existingData);
        }
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
            data: { metadata: connection.metadata as Metadata, connection_config: connection.connection_config },
            customFilePath: 'mocks/nango/getConnection.json',
            concatenateIfExists: false
        });

        saveResponse<Metadata>({
            directoryName,
            data: connection.metadata as Metadata,
            customFilePath: 'mocks/nango/getMetadata.json',
            concatenateIfExists: false
        });

        return response;
    }

    const [pathname, params] = response.request.path.split('?');
    const strippedPath = pathname.replace('/', '');

    const requestIdentity = [
        ['method', method],
        ['pathname', pathname],
        ['params', params]
    ];

    const headers = response.request.getHeaders();
    for (const [key, value] of Object.entries(headers)) {
        if (FILTER_HEADERS.includes(key)) {
            continue;
        }
        requestIdentity.push([`headers.${key}`, value]);
    }

    requestIdentity.sort((a, b) => a[0].localeCompare(b[0]));

    const requestHash = crypto.createHash('sha1').update(JSON.stringify(requestIdentity)).digest('hex');

    saveResponse<CachedRequest>({
        directoryName,
        data: {
            requestIdentityHash: requestHash,
            requestIdentity,
            response: response.data
        },
        customFilePath: `mocks/nango/${method}/${strippedPath}/${syncName}/${requestHash}.json`,
        concatenateIfExists: false
    });

    return response;
}
