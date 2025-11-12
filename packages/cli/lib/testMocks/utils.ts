import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import { getProvider } from '@nangohq/providers';
import { ActionError, PaginationService } from '@nangohq/runner-sdk';

import type { NangoActionBase, NangoSyncBase } from '@nangohq/runner-sdk';
import type { CursorPagination, LinkPagination, NangoProps, OffsetPagination, SdkLogger, TelemetryBag, UserProvidedProxyConfiguration } from '@nangohq/types';
import type { AxiosResponse } from 'axios';

/**
 * Base class for NangoAction mock without vitest dependency.
 * Can be used in non-test contexts like local CLI tests.
 */
class NangoActionMockBase implements Omit<NangoActionBase, 'nango'> {
    dirname: string;
    name: string;
    Model: string;
    private paginationService: typeof PaginationService;

    nango: any = { secretKey: 'secret-key' };
    activityLogId: string = 'test-activity-log-id';
    syncId?: string;
    nangoConnectionId?: number;
    environmentId: number = 1;
    environmentName?: string;
    syncJobId?: number;
    abortSignal?: NangoProps['abortSignal'];
    syncConfig?: NangoProps['syncConfig'];
    runnerFlags: NangoProps['runnerFlags'] = {} as NangoProps['runnerFlags'];
    scriptType: NangoProps['scriptType'] = 'action' as NangoProps['scriptType'];
    startTime: number = Date.now();
    isCLI: boolean = false;
    connectionId: string;
    providerConfigKey: string;
    provider?: string;
    ActionError = ActionError;
    telemetryBag: TelemetryBag = {
        customLogs: 0,
        proxyCalls: 0,
        durationMs: 0,
        memoryGb: 1
    };

    logger: SdkLogger = { level: 'debug' };

    // Store method references for potential wrapping in subclasses
    protected _getConnectionData: () => Promise<any>;
    protected _getMetadataData: () => Promise<any>;
    protected _getProxyPaginateData: (args: UserProvidedProxyConfiguration) => AsyncGenerator<any>;
    protected _proxyGetData: (args: UserProvidedProxyConfiguration) => Promise<any>;
    protected _proxyPostData: (args: UserProvidedProxyConfiguration) => Promise<any>;
    protected _proxyPatchData: (args: UserProvidedProxyConfiguration) => Promise<any>;
    protected _proxyPutData: (args: UserProvidedProxyConfiguration) => Promise<any>;
    protected _proxyDeleteData: (args: UserProvidedProxyConfiguration) => Promise<any>;
    protected _proxyData: (args: UserProvidedProxyConfiguration) => Promise<any>;

    constructor({ dirname, name, Model }: { dirname: string; name: string; Model: string }) {
        this.dirname = dirname;
        this.nango = {
            secretKey: 'secret-key'
        };
        this.providerConfigKey = dirname;
        this.connectionId = 'test-connection-id';
        this.name = name;
        this.Model = Model;
        this.paginationService = PaginationService;

        // Bind methods
        this._getConnectionData = this.getConnectionData.bind(this);
        this._getMetadataData = this.getMetadataData.bind(this);
        this._getProxyPaginateData = this.getProxyPaginateData.bind(this);
        this._proxyGetData = this.proxyGetData.bind(this);
        this._proxyPostData = this.proxyPostData.bind(this);
        this._proxyPatchData = this.proxyPatchData.bind(this);
        this._proxyPutData = this.proxyPutData.bind(this);
        this._proxyDeleteData = this.proxyDeleteData.bind(this);
        this._proxyData = this.proxyData.bind(this);
    }

    setLogger = () => {};
    log = () => {};
    getConnection = () => this._getConnectionData();
    getMetadata = () => this._getMetadataData();
    paginate = (args: UserProvidedProxyConfiguration) => this._getProxyPaginateData(args);
    get = (args: UserProvidedProxyConfiguration) => this._proxyGetData(args);
    post = (args: UserProvidedProxyConfiguration) => this._proxyPostData(args);
    patch = (args: UserProvidedProxyConfiguration) => this._proxyPatchData(args);
    put = (args: UserProvidedProxyConfiguration) => this._proxyPutData(args);
    delete = (args: UserProvidedProxyConfiguration) => this._proxyDeleteData(args);
    proxy = (args: UserProvidedProxyConfiguration) => this._proxyData(args);
    getWebhookURL = (() => 'https://example.com/webhook') as any;
    updateMetadata = (() => Promise.resolve()) as any;
    getToken = (() => Promise.resolve({ access_token: 'test-token', type: 'oauth2' as const })) as any;
    getIntegration = (() => Promise.resolve({ provider: 'test', unique_key: 'test' })) as any;
    setMetadata = (() => Promise.resolve()) as any;
    setFieldMapping = (() => Promise.resolve()) as any;
    getFieldMapping = (() => Promise.resolve(null)) as any;
    getEnvironmentVariables = (() => Promise.resolve(null)) as any;
    getFlowAttributes = (() => Promise.resolve(null)) as any;
    triggerAction = (() => Promise.resolve({} as any)) as any;
    triggerSync = (() => Promise.resolve()) as any;
    zodValidateInput = (({ input }: { input: any; zodSchema: any }) => Promise.resolve({ success: true as const, data: input })) as any;
    startSync = (() => Promise.resolve()) as any;
    uncontrolledFetch = (() => Promise.resolve(new Response())) as any;
    tryAcquireLock = (() => Promise.resolve(true)) as any;
    releaseLock = (() => Promise.resolve(true)) as any;
    releaseAllLocks = (() => Promise.resolve()) as any;

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

/**
 * Base class for NangoSync mock without vitest dependency.
 * Can be used in non-test contexts like local CLI tests.
 */
class NangoSyncMockBase extends NangoActionMockBase implements Omit<NangoSyncBase, 'nango'> {
    variant: string = 'base';
    track_deletes: boolean = false;

    modelFullName(model: string): string {
        if (this.variant === 'base') {
            return model;
        }
        return `${model}::${this.variant}`;
    }

    batchSave = () => Promise.resolve(true);
    batchDelete = () => Promise.resolve(true);
    batchUpdate = () => Promise.resolve(true);
    getRecordsByIds = () => Promise.resolve(new Map());
    deleteRecordsFromPreviousExecutions = () => Promise.resolve({ deletedKeys: [] });
    setMergingStrategy = () => Promise.resolve();
    batchSend = () => Promise.resolve(true);
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

// Export base classes that can be used without vitest
export { NangoActionMockBase, NangoSyncMockBase };

// Note: For vitest-wrapped mocks (NangoActionMock, NangoSyncMock),
// import from './utils.vitest.js' instead.
// They are kept separate to avoid loading vitest when using base classes.
