import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { BASE_VARIANT } from '@nangohq/runner-sdk';

import type { GetPublicConnection, Metadata } from '@nangohq/types';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

const FILTER_HEADERS = [
    'authorization',
    'user-agent',
    'nango-proxy-user-agent',
    'accept-encoding',
    'retries',
    'host',
    'connection-id',
    'provider-config-key',
    'nango-is-sync',
    'nango-is-dry-run',
    'nango-activity-log-id',
    'content-length',
    'accept',
    'base-url-override',
    'retry-on'
];

interface ConfigIdentity {
    method: string;
    endpoint: string;
    requestIdentityHash: string;
    requestIdentity: RequestIdentity;
}

interface RequestIdentity {
    method: string;
    endpoint: string;
    params: [string, unknown][];
    headers: [string, unknown][];
    data?: unknown;
}

interface CachedRequest {
    requestIdentityHash: string;
    requestIdentity: RequestIdentity;
    response: unknown;
    status: number;
    headers: Record<string, string>;
}

export function ensureDirectoryExists(directoryName: string): void {
    if (!fs.existsSync(directoryName)) {
        fs.mkdirSync(directoryName, { recursive: true });
    }
}

function saveResponse<T>({ directoryName, data, customFilePath }: { directoryName: string; data: T | T[]; customFilePath: string }): void {
    ensureDirectoryExists(`${directoryName}/mocks`);

    const filePath = path.join(directoryName, customFilePath);
    ensureDirectoryExists(path.dirname(filePath));

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function onAxiosRequestFulfilled({
    response,
    providerConfigKey,
    connectionId,
    syncName,
    syncVariant,
    hasStubbedMetadata
}: {
    response: AxiosResponse;
    providerConfigKey: string | undefined;
    connectionId: string;
    syncName: string;
    syncVariant: string;
    hasStubbedMetadata: boolean;
}): AxiosResponse {
    if (!providerConfigKey) {
        return response;
    }
    const directoryName = `${process.env['NANGO_MOCKS_RESPONSE_DIRECTORY'] ?? ''}${providerConfigKey}`;

    if (response.request.path.includes(`/connection/${connectionId}?provider_config_key=${providerConfigKey}`)) {
        const connection = response.data as GetPublicConnection['Success'];

        // getConnection could be getMetadata as well which would be cached
        saveResponse<Pick<GetPublicConnection['Success'], 'metadata' | 'connection_config'>>({
            directoryName,
            data: { metadata: connection.metadata as Metadata, connection_config: connection.connection_config },
            customFilePath: 'mocks/nango/getConnection.json'
        });

        if (!hasStubbedMetadata) {
            saveResponse<Metadata>({
                directoryName,
                data: connection.metadata as Metadata,
                customFilePath: 'mocks/nango/getMetadata.json'
            });
        }

        return response;
    }

    const requestIdentity = computeConfigIdentity(response.config);

    const syncSubDir = syncVariant && syncVariant !== BASE_VARIANT ? `${syncName}/${syncVariant}` : syncName;
    saveResponse<CachedRequest>({
        directoryName,
        data: {
            ...requestIdentity,
            response: response.data,
            status: response.status,
            headers: response.headers as Record<string, string>
        },
        customFilePath: `mocks/nango/${requestIdentity.method}/proxy/${requestIdentity.endpoint}/${syncSubDir}/${requestIdentity.requestIdentityHash}.json`
    });

    return response;
}

export function onAxiosRequestRejected({
    error,
    providerConfigKey,
    syncName,
    syncVariant
}: {
    error: unknown;
    providerConfigKey: string | undefined;
    connectionId: string;
    syncName: string;
    syncVariant: string;
}) {
    const directoryName = `${process.env['NANGO_MOCKS_RESPONSE_DIRECTORY'] ?? ''}${providerConfigKey}`;

    const response: AxiosResponse | undefined = (error as AxiosError).response;
    if (response) {
        const requestIdentity = computeConfigIdentity(response.config);
        const syncSubDir = syncVariant && syncVariant !== BASE_VARIANT ? `${syncName}/${syncVariant}` : syncName;
        saveResponse<CachedRequest>({
            directoryName,
            data: {
                ...requestIdentity,
                response: response.data,
                status: response.status,
                headers: response.headers as Record<string, string>
            },
            customFilePath: `mocks/nango/${requestIdentity.method}/proxy/${requestIdentity.endpoint}/${syncSubDir}/${requestIdentity.requestIdentityHash}.json`
        });
    }

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return Promise.reject(error);
}

function computeConfigIdentity(config: AxiosRequestConfig): ConfigIdentity {
    const method = config.method?.toLowerCase() || 'get';

    const url = new URL(config.url!);
    const endpoint = url.pathname.replace(/^\/proxy\//, '');

    const params = sortEntries(Array.from(url.searchParams.entries()).map(([key, value]) => [key, String(value)]));

    const dataIdentity = computeDataIdentity(config);

    let headers: [string, string][] = [];
    if (config.headers !== undefined) {
        const seen = new Set<string>();

        const filteredHeaders = Object.entries(config.headers)
            .map<[string, string]>(([key, value]) => [key.toLowerCase().startsWith('nango-proxy-') ? key.slice(12) : key, String(value)])
            .filter(([key, value]) => {
                const lowerKey = key.toLowerCase();

                // Skip if already seen
                if (seen.has(lowerKey)) return false;
                seen.add(lowerKey);

                // Skip filtered
                if (FILTER_HEADERS.includes(lowerKey)) return false;

                // Skip application/json
                if (lowerKey === 'content-type' && (value.toLowerCase() === 'application/json' || value === 'undefined')) return false;

                return true;
            });

        sortEntries(filteredHeaders);
        headers = filteredHeaders;
    }

    // order is important to the request hash
    const requestIdentity: RequestIdentity = {
        method,
        endpoint,
        params,
        headers,
        data: dataIdentity
    };
    const requestIdentityHash = crypto.createHash('sha1').update(JSON.stringify(requestIdentity)).digest('hex');

    return {
        method,
        endpoint,
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
        } catch (err) {
            if (err instanceof Error) {
                throw new Error(`Unable to compute request identity: ${err.message}`);
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
