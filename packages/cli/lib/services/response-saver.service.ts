import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { Connection } from '@nangohq/shared';
import type { Metadata } from '@nangohq/types';

const FILTER_HEADERS = ['authorization', 'user-agent', 'nango-proxy-user-agent', 'accept-encoding', 'retries', 'host'];

interface CachedRequest {
    requestIdentityHash: string;
    requestIdentity: unknown[];
    response: unknown;
}

interface ConfigIdentity {
    requestIdentityHash: string;
    requestIdentity: unknown[];
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

    const [pathname] = response.request.path.split('?');
    const strippedPath = pathname.replace('/', '');

    const requestIdentity = computeConfigIdentity(response.config);

    saveResponse<CachedRequest>({
        directoryName,
        data: {
            ...requestIdentity,
            response: response.data
        },
        customFilePath: `mocks/nango/${method}/${strippedPath}/${syncName}/${requestIdentity.requestIdentityHash}.json`,
        concatenateIfExists: false
    });

    return response;
}

function computeConfigIdentity(config: AxiosRequestConfig): ConfigIdentity {
    const method = config.method?.toLowerCase() || 'get';
    const params = sortEntries(Object.entries(config.params || {}));

    const requestIdentity: [string, unknown][] = [
        ['method', method],
        ['url', config.url],
        ['params', params]
    ];

    const dataIdentity = computeDataIdentity(config);
    if (dataIdentity) {
        requestIdentity.push(['data', dataIdentity]);
    }

    if (config.headers !== undefined) {
        const filteredHeaders = Object.entries(config.headers).filter(([key]) => !FILTER_HEADERS.includes(key));
        sortEntries(filteredHeaders);
        requestIdentity.push([`headers`, filteredHeaders]);
    }

    // sort by key so we have a consistent hash
    sortEntries(requestIdentity);

    const requestIdentityHash = crypto.createHash('sha1').update(JSON.stringify(requestIdentity)).digest('hex');

    return {
        requestIdentityHash,
        requestIdentity
    };
}

function sortEntries(entries: [string, unknown][]): [string, unknown][] {
    return entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function computeDataIdentity(config: AxiosRequestConfig): string | undefined {
    const data = config.data;

    if (!data) {
        return undefined;
    }

    let dataString = '';
    if (typeof data === 'string') {
        dataString = data;
    } else if (Buffer.isBuffer(data)) {
        dataString = data.toString('base64');
    } else {
        try {
            dataString = JSON.stringify(data);
        } catch (e) {
            if (e instanceof Error) {
                throw new Error(`Unable to compute request identity: ${e.message}`);
            } else {
                throw new Error('Unable to compute request identity');
            }
        }
    }

    if (dataString.length > 1000) {
        return 'sha1:' + crypto.createHash('sha1').update(dataString).digest('hex');
    } else {
        return dataString;
    }
}
