import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { GetPublicConnection, Metadata } from '@nangohq/types';
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

interface RequestIdentity {
    method: string;
    endpoint: string;
    params: [string, unknown][];
    headers: [string, unknown][];
    data?: unknown;
}

interface CachedRequest {
    requestIdentity: RequestIdentity;
    requestIdentityHash: string;
    response: unknown;
    status: number;
    headers: Record<string, string>;
}

interface ApiMockResponse {
    response: unknown;
    headers?: Record<string, string>;
    status?: number;
    hash?: string;
    request?: {
        params?: Record<string, unknown>;
        headers?: Record<string, unknown>;
        data?: unknown;
    };
}

interface UnifiedMock {
    input?: unknown;
    output?: unknown;
    nango: {
        getConnection?: { connectionId: string; provider: string };
        getMetadata?: Metadata;
        batchSave?: Record<string, unknown[]>;
        batchDelete?: Record<string, unknown[]>;
    };
    api: Record<string, Record<string, ApiMockResponse | ApiMockResponse[]>>;
}

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
    'nango-is-script',
    'nango-is-dry-run',
    'nango-activity-log-id',
    'content-length',
    'accept',
    'base-url-override',
    'retry-on'
];

export class ResponseCollector {
    private apiCalls: CachedRequest[] = [];
    private connectionInfo?: { connectionId: string; provider: string };
    private metadata?: Metadata;
    private batchSaveData: Record<string, unknown[]> = {};
    private batchDeleteData: Record<string, unknown[]> = {};

    public onAxiosRequestFulfilled(response: AxiosResponse, connectionId: string): AxiosResponse {
        // Handle getConnection/getMetadata calls
        if (response.request.path.includes(`/connections/${connectionId}`)) {
            const connection = response.data as GetPublicConnection['Success'];
            this.connectionInfo = {
                connectionId: connection.connection_config['connection_id'],
                provider: connection.connection_config['provider']
            };
            this.metadata = connection.metadata as Metadata;
            return response;
        }

        // Handle regular API calls
        const { requestIdentity, requestIdentityHash } = this.computeRequestIdentity(response.config);
        this.apiCalls.push({
            requestIdentity,
            requestIdentityHash,
            response: response.data,
            status: response.status,
            headers: response.headers as Record<string, string>
        });
        return response;
    }

    public onAxiosRequestRejected(error: unknown): Promise<never> {
        const response: AxiosResponse | undefined = (error as AxiosError).response;
        if (response) {
            const { requestIdentity, requestIdentityHash } = this.computeRequestIdentity(response.config);
            this.apiCalls.push({
                requestIdentity,
                requestIdentityHash,
                response: response.data,
                status: response.status,
                headers: response.headers as Record<string, string>
            });
        }
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(error);
    }

    public addBatchSave(model: string, data: unknown[]): void {
        if (!this.batchSaveData[model]) {
            this.batchSaveData[model] = [];
        }
        this.batchSaveData[model].push(...data);
    }

    public addBatchDelete(model: string, data: unknown[]): void {
        if (!this.batchDeleteData[model]) {
            this.batchDeleteData[model] = [];
        }
        this.batchDeleteData[model].push(...data);
    }

    public saveUnifiedMock({
        filePath,
        input,
        output,
        stubbedMetadata
    }: {
        filePath: string;
        input?: unknown;
        output?: unknown;
        stubbedMetadata?: Metadata | undefined;
    }): void {
        const nangoData: UnifiedMock['nango'] = {};

        if (this.connectionInfo) {
            nangoData.getConnection = this.connectionInfo;
        }

        const metadataToSave = stubbedMetadata || this.metadata;
        if (metadataToSave) {
            nangoData.getMetadata = metadataToSave;
        }

        if (Object.keys(this.batchSaveData).length > 0) {
            nangoData.batchSave = this.batchSaveData;
        }

        if (Object.keys(this.batchDeleteData).length > 0) {
            nangoData.batchDelete = this.batchDeleteData;
        }

        const mockData: UnifiedMock = {
            input,
            output,
            nango: nangoData,
            api: {}
        };

        for (const call of this.apiCalls) {
            const { method, endpoint } = call.requestIdentity;
            if (!mockData.api[method]) {
                mockData.api[method] = {};
            }

            const endpointKey = `/${endpoint}`;
            const existingEntry = mockData.api[method][endpointKey];

            const params = Object.fromEntries(call.requestIdentity.params);
            const headers = Object.fromEntries(call.requestIdentity.headers);

            let requestData = call.requestIdentity.data;
            if (typeof requestData === 'string') {
                try {
                    requestData = JSON.parse(requestData);
                } catch {
                    // ignore
                }
            }

            const newEntry: ApiMockResponse = {
                response: call.response,
                status: call.status,
                headers: call.headers,
                hash: call.requestIdentityHash,
                request: {
                    ...(Object.keys(params).length > 0 ? { params } : {}),
                    ...(Object.keys(headers).length > 0 ? { headers } : {}),
                    ...(requestData ? { data: requestData } : {})
                }
            };

            if (existingEntry) {
                if (Array.isArray(existingEntry)) {
                    if (!existingEntry.some((e) => e.hash === newEntry.hash)) {
                        existingEntry.push(newEntry);
                    }
                } else {
                    if (existingEntry.hash !== newEntry.hash) {
                        mockData.api[method][endpointKey] = [existingEntry, newEntry];
                    }
                }
            } else {
                mockData.api[method][endpointKey] = newEntry;
            }
        }

        this.ensureDirectoryExists(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(mockData, null, 2));
    }

    private ensureDirectoryExists(directoryName: string): void {
        if (!fs.existsSync(directoryName)) {
            fs.mkdirSync(directoryName, { recursive: true });
        }
    }

    private computeRequestIdentity(config: AxiosRequestConfig): { requestIdentity: RequestIdentity; requestIdentityHash: string } {
        const method = config.method?.toLowerCase() || 'get';

        const url = new URL(config.url!);
        const endpoint = url.pathname.replace(/^\/proxy\//, '');

        const params = this.sortEntries(Array.from(url.searchParams.entries()).map(([key, value]) => [key, String(value)]));

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

            this.sortEntries(filteredHeaders);
            headers = filteredHeaders;
        }

        const dataIdentity = this.computeDataIdentity(config);

        const requestIdentity: RequestIdentity = {
            method,
            endpoint,
            params,
            headers,
            data: dataIdentity
        };

        const requestIdentityForHash = {
            ...requestIdentity,
            method: method.toLowerCase()
        };

        const requestIdentityHash = crypto.createHash('sha1').update(JSON.stringify(requestIdentityForHash)).digest('hex');

        return {
            requestIdentity,
            requestIdentityHash
        };
    }

    private sortEntries(entries: [string, unknown][]): [string, unknown][] {
        return entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    }

    private computeDataIdentity(config: AxiosRequestConfig): string | undefined {
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
}
