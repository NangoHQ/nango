import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import { vi } from 'vitest';

import { getProvider } from '@nangohq/providers';
import { PaginationService } from '@nangohq/runner-sdk';

import type { CursorPagination, LinkPagination, OffsetPagination, UserProvidedProxyConfiguration } from '@nangohq/types';
import type { AxiosResponse } from 'axios';

class NangoActionMock {
    dirname: string;
    name: string;
    Model: string;
    nango: {
        secretKey: string;
    };

    providerConfigKey: string;
    private paginationService: typeof PaginationService;

    log = vi.fn();
    ActionError = vi.fn();
    getConnection: ReturnType<typeof vi.fn>;
    getMetadata: ReturnType<typeof vi.fn>;
    updateMetadata: ReturnType<typeof vi.fn>;
    paginate: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    proxy: ReturnType<typeof vi.fn>;
    getWebhookURL: ReturnType<typeof vi.fn>;

    constructor({ dirname, name, Model }: { dirname: string; name: string; Model: string }) {
        this.dirname = dirname;
        this.nango = {
            secretKey: 'secret-key'
        };
        this.providerConfigKey = dirname;
        this.name = name;
        this.Model = Model;
        this.paginationService = PaginationService;
        this.getConnection = vi.fn(this.getConnectionData.bind(this));
        this.getMetadata = vi.fn(this.getMetadataData.bind(this));
        this.paginate = vi.fn(this.getProxyPaginateData.bind(this));
        this.get = vi.fn(this.proxyGetData.bind(this));
        this.post = vi.fn(this.proxyPostData.bind(this));
        this.patch = vi.fn(this.proxyPatchData.bind(this));
        this.put = vi.fn(this.proxyPutData.bind(this));
        this.delete = vi.fn(this.proxyDeleteData.bind(this));
        this.proxy = vi.fn(this.proxyData.bind(this));
        this.getWebhookURL = vi.fn(() => 'https://example.com/webhook');
        this.updateMetadata = vi.fn();
    }

    private async getMockFile(fileName: string, throwOnMissing: boolean, identity?: ConfigIdentity) {
        const filePath = path.resolve(this.dirname, `mocks/${fileName}.json`);
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(fileContent);
            return data;
        } catch (err: any) {
            if (identity && identity.requestIdentity && fileName.includes(identity.requestIdentityHash)) {
                const normalizedHash = computeNormalizedHash(identity.requestIdentity);
                if (normalizedHash !== identity.requestIdentityHash) {
                    const fallbackFileName = fileName.replace(identity.requestIdentityHash, normalizedHash);
                    const fallbackFilePath = path.resolve(this.dirname, `mocks/${fallbackFileName}.json`);
                    try {
                        const fileContent = await fs.readFile(fallbackFilePath, 'utf-8');
                        const data = JSON.parse(fileContent);
                        return data;
                        // eslint-disable-next-line no-empty
                    } catch {}
                }
            }

            if (throwOnMissing) {
                throw new Error(`Failed to load mock data from ${filePath}: ${err.message} ${identity ? JSON.stringify(identity, null, 2) : ''}`);
            }
        }
    }

    private async hashDirExists(hashDir: string) {
        const filePath = path.resolve(this.dirname, `mocks/${hashDir}/`);
        try {
            await fs.stat(filePath);
            return true;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            return false;
        }
    }

    private async getCachedResponse(identity: ConfigIdentity) {
        const dir = `nango/${identity.method}/proxy/${identity.endpoint}/${this.name}/`;
        const hashBasedPath = `${dir}/${identity.requestIdentityHash}`;

        if (await this.hashDirExists(dir)) {
            const data = await this.getMockFile(hashBasedPath, true, identity);
            return data;
        } else {
            return {
                response: await this.getMockFile(`nango/${identity.method}/proxy/${identity.endpoint}/${this.name}`, true, identity)
            };
        }
    }

    public async getBatchSaveData(modelName: string) {
        const data = await this.getMockFile(`${this.name}/${modelName}/batchSave`, true);
        return data;
    }

    public async getBatchDeleteData(modelName: string) {
        const data = await this.getMockFile(`${this.name}/${modelName}/batchDelete`, true);
        return data;
    }

    public async getInput() {
        const data = await this.getMockFile(`${this.name}/input`, false);
        return data;
    }

    public async getOutput() {
        const data = await this.getMockFile(`${this.name}/output`, true);
        return data;
    }

    private async getConnectionData() {
        const data = await this.getMockFile(`nango/getConnection`, true);
        return data;
    }

    private async getMetadataData() {
        const data = await this.getMockFile('nango/getMetadata', true);
        return data;
    }

    private async *getProxyPaginateData(args: UserProvidedProxyConfiguration) {
        const providerConfig = getProvider(this.providerConfigKey);
        if (!providerConfig) {
            throw new Error(`Provider config not found for ${this.providerConfigKey}`);
        }

        args.method = args.method || 'get';

        args.paginate = {
            ...providerConfig.proxy?.paginate,
            ...args.paginate
        };

        const paginateInBody = ['post', 'put', 'patch'].includes(args.method.toLowerCase());
        const updatedBodyOrParams = paginateInBody ? (args.data as Record<string, any>) || {} : args.params || {};

        if (args.paginate['limit']) {
            const limitParameterName = args.paginate.limit_name_in_request!;
            if (typeof updatedBodyOrParams === 'object') {
                updatedBodyOrParams[limitParameterName] = args.paginate['limit'];
            }
        }

        const proxyFunction = async (config: UserProvidedProxyConfiguration): Promise<AxiosResponse> => {
            const response = await this.proxyData(config);
            return {
                data: response.data,
                status: response.status,
                statusText: 'OK',
                headers: response.headers,
                config: {} as any
            };
        };

        if (args.paginate.type === 'cursor') {
            yield* this.paginationService.cursor(
                args,
                args.paginate as CursorPagination,
                updatedBodyOrParams as Record<string, any>,
                paginateInBody,
                proxyFunction
            );
        } else if (args.paginate.type === 'link') {
            yield* this.paginationService.link(
                args,
                args.paginate as LinkPagination,
                updatedBodyOrParams as Record<string, any>,
                paginateInBody,
                proxyFunction
            );
        } else if (args.paginate.type === 'offset') {
            yield* this.paginationService.offset(
                args,
                args.paginate as OffsetPagination,
                updatedBodyOrParams as Record<string, any>,
                paginateInBody,
                proxyFunction
            );
        } else {
            throw new Error(`Invalid pagination type: ${args.paginate?.type}`);
        }
    }

    private async proxyGetData(args: UserProvidedProxyConfiguration) {
        return this.proxyData({ ...args, method: 'get' });
    }

    private async proxyPostData(args: UserProvidedProxyConfiguration) {
        return this.proxyData({ ...args, method: 'post' });
    }

    private async proxyPatchData(args: UserProvidedProxyConfiguration) {
        return this.proxyData({ ...args, method: 'patch' });
    }

    private async proxyPutData(args: UserProvidedProxyConfiguration) {
        return this.proxyData({ ...args, method: 'put' });
    }

    private async proxyDeleteData(args: UserProvidedProxyConfiguration) {
        return this.proxyData({ ...args, method: 'delete' });
    }

    private async proxyData(args: UserProvidedProxyConfiguration) {
        const identity = computeConfigIdentity(args);
        const cached = await this.getCachedResponse(identity);

        return {
            data: cached.response,
            headers: cached.headers,
            status: cached.status
        };
    }
}

class NangoSyncMock extends NangoActionMock {
    lastSyncDate = null;

    batchSave: ReturnType<typeof vi.fn>;
    batchDelete: ReturnType<typeof vi.fn>;

    constructor({ dirname, name, Model }: { dirname: string; name: string; Model: string }) {
        super({ dirname, name, Model });
        this.batchSave = vi.fn();
        this.batchDelete = vi.fn();
    }
}

const FILTER_HEADERS = ['authorization', 'user-agent', 'nango-proxy-user-agent', 'accept-encoding', 'retries', 'host', 'connection-id', 'provider-config-key'];

interface RequestIdentity {
    method: string;
    endpoint: string;
    params: [string, unknown][];
    headers: [string, unknown][];
    data?: unknown;
}

interface ConfigIdentity {
    method: string;
    endpoint: string;
    requestIdentityHash: string;
    requestIdentity: RequestIdentity;
}

function computeConfigIdentity(config: UserProvidedProxyConfiguration): ConfigIdentity {
    const method = config.method?.toLowerCase() || 'get';
    const params = sortEntries(Object.entries(config.params || {}));
    const endpoint = config.endpoint.startsWith('/') ? config.endpoint.slice(1) : config.endpoint;

    const dataIdentity = computeDataIdentity(config);

    const filteredHeaders = Object.entries(config.headers || {}).filter(([key]) => !FILTER_HEADERS.includes(key.toLowerCase()));
    sortEntries(filteredHeaders);
    const headers = filteredHeaders;

    const requestIdentity = {
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

function computeNormalizedHash(requestIdentity: RequestIdentity): string {
    const normalized = {
        ...requestIdentity,
        params: requestIdentity.params.map(([k, v]) => [k, String(v)])
    };
    return crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
}

function computeDataIdentity(config: UserProvidedProxyConfiguration): string | undefined {
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

export { NangoActionMock, NangoSyncMock };
