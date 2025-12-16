import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import parseLinksHeader from 'parse-link-header';
import { vi } from 'vitest';

import { getProvider } from '@nangohq/providers';

import type { CursorPagination, LinkPagination, OffsetCalculationMethod, OffsetPagination, Pagination, UserProvidedProxyConfiguration } from '@nangohq/types';

interface FixtureProvider {
    getBatchSaveData(modelName: string): Promise<any>;
    getBatchDeleteData(modelName: string): Promise<any>;
    getInput(): Promise<any>;
    getOutput(): Promise<any>;
    getConnectionData(): Promise<any>;
    getMetadataData(): Promise<any>;
    getCachedResponse(identity: ConfigIdentity): Promise<any>;
    getUpdateMetadata(): Promise<any>;
    getDeleteRecordsFromPreviousExecutions(): Promise<any>;
}

class LegacyFixtureProvider implements FixtureProvider {
    constructor(
        private dirname: string,
        private name: string
    ) {}

    private async getMockFile(fileName: string, throwOnMissing: boolean, identity?: ConfigIdentity) {
        const filePath = path.resolve(this.dirname, `../mocks/${fileName}.json`);
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(fileContent);
            return data;
        } catch (err: any) {
            if (throwOnMissing) {
                throw new Error(`Failed to load mock data from ${filePath}: ${err.message} ${identity ? JSON.stringify(identity, null, 2) : ''}`);
            }
            return undefined;
        }
    }

    private async hashDirExists(hashDir: string) {
        const filePath = path.resolve(this.dirname, `../mocks/${hashDir}/`);

        try {
            await fs.stat(filePath);
            return true;
        } catch (_) {
            return false;
        }
    }

    async getCachedResponse(identity: ConfigIdentity) {
        const dir = `nango/${identity.method}/proxy/${identity.endpoint}/${this.name}/`;
        const hashBasedPath = `${dir}/${identity.requestIdentityHash}`;

        if (await this.hashDirExists(dir)) {
            const data = await this.getMockFile(hashBasedPath, true, identity);
            return data;
        } else {
            return { response: await this.getMockFile(`nango/${identity.method}/proxy/${identity.endpoint}/${this.name}`, true, identity) };
        }
    }

    async getBatchSaveData(modelName: string) {
        return this.getMockFile(`${this.name}/${modelName}/batchSave`, true);
    }

    async getBatchDeleteData(modelName: string) {
        return this.getMockFile(`${this.name}/${modelName}/batchDelete`, true);
    }

    async getInput() {
        return this.getMockFile(`${this.name}/input`, false);
    }

    async getOutput() {
        return this.getMockFile(`${this.name}/output`, true);
    }

    async getConnectionData() {
        return this.getMockFile(`nango/getConnection`, true);
    }

    async getMetadataData() {
        return this.getMockFile('nango/getMetadata', true);
    }

    async getUpdateMetadata() {
        return this.getMockFile('nango/updateMetadata', false);
    }

    async getDeleteRecordsFromPreviousExecutions() {
        return this.getMockFile('nango/deleteRecordsFromPreviousExecutions', false);
    }
}

interface MockResponse {
    data: unknown;
    headers: Record<string, string>;
    status: number;
}

interface ApiMockResponse {
    response: any;
    headers?: Record<string, string>;
    status?: number;
    hash?: string;
    request?: {
        params: Record<string, unknown> | undefined;
        headers: Record<string, unknown> | undefined;
        data?: unknown;
    };
}

interface UnifiedMockData {
    input?: any;
    output?: any;
    nango?: {
        batchSave?: Record<string, any>;
        batchDelete?: Record<string, any>;
        getConnection?: any;
        getMetadata?: any;
        updateMetadata?: any;
        deleteRecordsFromPreviousExecutions?: any;
    };
    api?: Record<string, Record<string, ApiMockResponse | ApiMockResponse[]>>;
}

class UnifiedFixtureProvider implements FixtureProvider {
    constructor(private mockData: UnifiedMockData) {}

    // eslint-disable-next-line @typescript-eslint/require-await
    async getBatchSaveData(modelName: string) {
        return this.mockData.nango?.batchSave?.[modelName];
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getBatchDeleteData(modelName: string) {
        return this.mockData.nango?.batchDelete?.[modelName];
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getInput() {
        return this.mockData.input;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getOutput() {
        const data = this.mockData.output;
        if (data === undefined) {
            throw new Error(`Missing mock data for output`);
        }
        return data;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getConnectionData() {
        const data = this.mockData.nango?.getConnection;
        if (data === undefined) {
            throw new Error(`Missing mock data for getConnection`);
        }
        return data;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getMetadataData() {
        const data = this.mockData.nango?.getMetadata;
        if (data === undefined) {
            throw new Error(`Missing mock data for getMetadata`);
        }
        return data;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getUpdateMetadata() {
        return this.mockData.nango?.updateMetadata;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getDeleteRecordsFromPreviousExecutions() {
        return this.mockData.nango?.deleteRecordsFromPreviousExecutions;
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async getCachedResponse(identity: ConfigIdentity) {
        const { method, endpoint, requestIdentityHash } = identity;

        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;

        // The endpoint in the mock file can be stored with or without a leading slash.
        // This ensures we can find it in both cases.
        let apiMock = this.mockData.api?.[method.toUpperCase()]?.[normalizedEndpoint];

        if (!apiMock) {
            apiMock = this.mockData.api?.[method.toUpperCase()]?.[`/${normalizedEndpoint}`];
        }

        if (apiMock) {
            if (Array.isArray(apiMock)) {
                const matchedMock = apiMock.find((mock: ApiMockResponse) => {
                    if (mock.hash && mock.hash === requestIdentityHash) {
                        return true;
                    }
                    if (mock.request) {
                        if (mock.request.params) {
                            for (const [key, value] of Object.entries(mock.request.params)) {
                                const actualParam = identity.requestIdentity.params.find(([k]) => k === key);
                                if (!actualParam || String(actualParam[1]) !== String(value)) {
                                    return false;
                                }
                            }
                        }
                        if (mock.request.headers) {
                            for (const [key, value] of Object.entries(mock.request.headers)) {
                                const actualHeader = identity.requestIdentity.headers.find(([k]) => k.toLowerCase() === key.toLowerCase());
                                if (!actualHeader || String(actualHeader[1]) !== String(value)) {
                                    return false;
                                }
                            }
                        }
                        if (mock.request.data !== undefined) {
                            const expectedDataIdentity = computeDataIdentity({ data: mock.request.data } as UserProvidedProxyConfiguration);
                            if (expectedDataIdentity !== identity.requestIdentity.data) {
                                return false;
                            }
                        }
                        return true;
                    }
                    return false;
                });

                if (matchedMock) {
                    return matchedMock;
                }
            } else {
                return apiMock;
            }
        }

        throw new Error(`No mock found for ${method.toUpperCase()} ${endpoint} (normalized: ${normalizedEndpoint}) with hash ${requestIdentityHash}`);
    }
}

class RecordingFixtureProvider implements FixtureProvider {
    private recordedData: UnifiedMockData = {
        input: null,
        output: null,
        nango: {},
        api: {}
    };

    constructor(
        private delegate: FixtureProvider,
        private outputPath: string
    ) {}

    private async save() {
        const dataToSave = JSON.parse(JSON.stringify(this.recordedData));

        // Prevent empty keys
        if (Object.keys(dataToSave.nango?.batchSave || {}).length === 0) delete dataToSave.nango?.batchSave;
        if (Object.keys(dataToSave.nango?.batchDelete || {}).length === 0) delete dataToSave.nango?.batchDelete;
        if (Object.keys(dataToSave.nango || {}).length === 0) delete dataToSave.nango;
        if (Object.keys(dataToSave.api || {}).length === 0) delete dataToSave.api;
        if (dataToSave.input === null) delete dataToSave.input;
        if (dataToSave.output === null) delete dataToSave.output;

        await fs.writeFile(this.outputPath, JSON.stringify(dataToSave, null, 4));
    }

    async getBatchSaveData(modelName: string) {
        const data = await this.delegate.getBatchSaveData(modelName);
        if (!this.recordedData.nango) this.recordedData.nango = {};
        if (!this.recordedData.nango.batchSave) this.recordedData.nango.batchSave = {};
        this.recordedData.nango.batchSave[modelName] = data;
        await this.save();
        return data;
    }

    async getBatchDeleteData(modelName: string) {
        const data = await this.delegate.getBatchDeleteData(modelName);
        if (!this.recordedData.nango) this.recordedData.nango = {};
        if (!this.recordedData.nango.batchDelete) this.recordedData.nango.batchDelete = {};
        this.recordedData.nango.batchDelete[modelName] = data;
        await this.save();
        return data;
    }

    async getInput() {
        const data = await this.delegate.getInput();
        this.recordedData.input = data;
        await this.save();
        return data;
    }

    async getOutput() {
        const data = await this.delegate.getOutput();
        this.recordedData.output = data;
        await this.save();
        return data;
    }

    async getConnectionData() {
        const data = await this.delegate.getConnectionData();
        if (!this.recordedData.nango) this.recordedData.nango = {};
        this.recordedData.nango.getConnection = data;
        await this.save();
        return data;
    }

    async getMetadataData() {
        const data = await this.delegate.getMetadataData();
        if (!this.recordedData.nango) this.recordedData.nango = {};
        this.recordedData.nango.getMetadata = data;
        await this.save();
        return data;
    }

    async getUpdateMetadata() {
        const data = await this.delegate.getUpdateMetadata();
        if (!this.recordedData.nango) this.recordedData.nango = {};
        this.recordedData.nango.updateMetadata = data;
        await this.save();
        return data;
    }

    async getDeleteRecordsFromPreviousExecutions() {
        const data = await this.delegate.getDeleteRecordsFromPreviousExecutions();
        if (!this.recordedData.nango) this.recordedData.nango = {};
        this.recordedData.nango.deleteRecordsFromPreviousExecutions = data;
        await this.save();
        return data;
    }

    async getCachedResponse(identity: ConfigIdentity) {
        const data = await this.delegate.getCachedResponse(identity);

        const method = identity.method.toUpperCase();
        const endpoint = identity.endpoint;

        if (!this.recordedData.api) this.recordedData.api = {};
        if (!this.recordedData.api[method]) this.recordedData.api[method] = {};
        if (!this.recordedData.api[method][endpoint]) this.recordedData.api[method][endpoint] = [];

        const params = Object.fromEntries(identity.requestIdentity.params);
        const headers = Object.fromEntries(identity.requestIdentity.headers);

        let requestData = identity.requestIdentity.data;
        if (typeof requestData === 'string') {
            try {
                requestData = JSON.parse(requestData);
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                return Promise.reject(err);
            }
        }

        const record: ApiMockResponse = {
            request: {
                params: Object.keys(params).length > 0 ? params : undefined,
                headers: Object.keys(headers).length > 0 ? headers : undefined,
                data: requestData
            },
            response: data.response,
            hash: identity.requestIdentityHash
        };

        const currentMocks = this.recordedData.api[method][endpoint];
        // Ensure it's treated as an array for the recorder
        const mocksArray = Array.isArray(currentMocks) ? currentMocks : [currentMocks];

        const exists = mocksArray.some((r: ApiMockResponse) => r.hash === record.hash);
        if (!exists) {
            (this.recordedData.api[method][endpoint] as ApiMockResponse[]).push(record);
            await this.save();
        }

        return data;
    }
}

async function getFixtureProvider(dirname: string, name: string): Promise<FixtureProvider> {
    let testFileName = name;
    // Inspect the stack trace to automatically determine the name of the test file that is currently running.
    // This allows it to locate the corresponding `.test.json` mock file (e.g., `my-test.test.ts` uses `my-test.test.json`).
    // The `name` parameter serves as a fallback if the test file cannot be determined from the stack trace, or its missing
    try {
        const stack = new Error().stack;
        if (stack) {
            const lines = stack.split('\n');
            for (const line of lines) {
                if (line.includes(dirname) && line.includes('.test.ts')) {
                    const match = line.match(/\/([^/]+\.test\.ts)/);
                    if (match && match[1]) {
                        testFileName = match[1].replace('.test.ts', '');
                        break;
                    }
                }
            }
        }
    } catch (err) {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject(err);
    }

    let unifiedMockPath = path.resolve(dirname, `${testFileName}.test.json`);

    let unifiedFileExists = false;
    try {
        await fs.stat(unifiedMockPath);
        unifiedFileExists = true;
    } catch (_) {
        if (testFileName !== name) {
            const fallbackPath = path.resolve(dirname, `${name}.test.json`);
            try {
                await fs.stat(fallbackPath);
                unifiedMockPath = fallbackPath;
                unifiedFileExists = true;
            } catch (_) {
                unifiedFileExists = false;
            }
        }
    }

    if (unifiedFileExists) {
        const fileContent = await fs.readFile(unifiedMockPath, 'utf-8');
        return new UnifiedFixtureProvider(JSON.parse(fileContent));
    }

    // This section supports the migration of tests from the legacy mock format (multiple files per test)
    // to the new unified format (a single `.test.json` file). When the `MIGRATE_MOCKS` environment variable is set,
    // it uses the `RecordingFixtureProvider` to intercept calls to the old mock loader, run the test, and then
    // save all the mock data that was accessed into a single new `.test.json` file.
    // This is a developer utility, not a production runtime feature.
    if (process.env?.['MIGRATE_MOCKS']) {
        const legacyLoader = new LegacyFixtureProvider(dirname, name);
        return new RecordingFixtureProvider(legacyLoader, unifiedMockPath);
    }

    return new LegacyFixtureProvider(dirname, name);
}

class NangoActionMock {
    dirname: string;
    name: string;
    Model: string;

    providerConfigKey: string;
    private fixtureProvider: Promise<FixtureProvider>;

    log: ReturnType<typeof vi.fn>;
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
    zodValidateInput: ReturnType<typeof vi.fn>;
    deleteRecordsFromPreviousExecutions: ReturnType<typeof vi.fn>;

    constructor({ dirname, name, Model }: { dirname: string; name: string; Model: string }) {
        this.dirname = dirname;
        this.providerConfigKey = path.basename(path.dirname(dirname));
        this.name = name;
        this.Model = Model;
        this.fixtureProvider = getFixtureProvider(dirname, name);

        this.log = vi.fn();
        this.getConnection = vi.fn(this.getConnectionData.bind(this));
        this.getMetadata = vi.fn(this.getMetadataData.bind(this));
        this.updateMetadata = vi.fn(this.getUpdateMetadata.bind(this));
        this.deleteRecordsFromPreviousExecutions = vi.fn(this.getDeleteRecordsFromPreviousExecutions.bind(this));

        this.paginate = vi.fn(this.getProxyPaginateData.bind(this));
        this.get = vi.fn(this.proxyGetData.bind(this));
        this.post = vi.fn(this.proxyPostData.bind(this));
        this.patch = vi.fn(this.proxyPatchData.bind(this));
        this.put = vi.fn(this.proxyPutData.bind(this));
        this.delete = vi.fn(this.proxyDeleteData.bind(this));
        this.proxy = vi.fn(this.proxyData.bind(this));
        this.getWebhookURL = vi.fn(() => 'https://example.com/webhook');
        this.zodValidateInput = vi.fn(this.mockZodValidateInput.bind(this));
    }

    private mockZodValidateInput({ input }: { input: any }) {
        return {
            data: input
        };
    }

    public async getBatchSaveData(modelName: string) {
        return (await this.fixtureProvider).getBatchSaveData(modelName);
    }

    public async getBatchDeleteData(modelName: string) {
        return (await this.fixtureProvider).getBatchDeleteData(modelName);
    }

    public async getInput() {
        return (await this.fixtureProvider).getInput();
    }

    public async getOutput() {
        return (await this.fixtureProvider).getOutput();
    }

    private async getConnectionData() {
        return (await this.fixtureProvider).getConnectionData();
    }

    private async getMetadataData() {
        return (await this.fixtureProvider).getMetadataData();
    }

    private async getUpdateMetadata() {
        return (await this.fixtureProvider).getUpdateMetadata();
    }

    private async getDeleteRecordsFromPreviousExecutions() {
        return (await this.fixtureProvider).getDeleteRecordsFromPreviousExecutions();
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
        const updatedBodyOrParams: Record<string, any> = (paginateInBody ? (args.data as Record<string, any>) || {} : args.params || {}) as Record<string, any>;

        if (args.paginate['limit']) {
            const limitParameterName = args.paginate.limit_name_in_request!;

            updatedBodyOrParams[limitParameterName] = args.paginate['limit'];
        }

        if (args.paginate?.type === 'cursor') {
            yield* this.cursorPaginate(args, updatedBodyOrParams, paginateInBody);
        } else if (args.paginate?.type === 'link') {
            yield* this.linkPaginate(args, updatedBodyOrParams, paginateInBody);
        } else if (args.paginate?.type === 'offset') {
            yield* this.offsetPaginate(args, updatedBodyOrParams, paginateInBody);
        } else {
            throw new Error(`Invalid pagination type: ${args.paginate?.type}`);
        }
    }

    private async *cursorPaginate(args: UserProvidedProxyConfiguration, updatedBodyOrParams: Record<string, any>, paginateInBody: boolean) {
        const cursorPagination = args.paginate as CursorPagination;

        let nextCursor: string | number | undefined;
        do {
            if (typeof nextCursor !== 'undefined') {
                updatedBodyOrParams[cursorPagination.cursor_name_in_request] = nextCursor;
            }

            if (paginateInBody) {
                args.data = updatedBodyOrParams;
            } else {
                args.params = updatedBodyOrParams;
            }

            const response = await this.proxyData(args);
            if (!response.headers) {
                const data = response.data;
                const paginate = args.paginate as Pagination;

                if (Array.isArray(data)) {
                    yield data;
                }
                if (paginate && paginate.response_path) {
                    yield data[paginate.response_path];
                } else {
                    const keys = Object.keys(data);
                    for (const key of keys) {
                        if (Array.isArray(data[key])) {
                            yield data[key];
                        }
                    }
                }
                return;
            }

            const responseData = cursorPagination.response_path ? response.data[cursorPagination.response_path] : response.data;

            if (!responseData || !responseData.length) {
                return;
            }

            yield responseData;

            nextCursor = response.data[cursorPagination.cursor_path_in_response];
            if (typeof nextCursor === 'string') {
                nextCursor = nextCursor.trim();
                if (!nextCursor) {
                    nextCursor = undefined;
                }
            } else if (typeof nextCursor !== 'number') {
                nextCursor = undefined;
            }
        } while (typeof nextCursor !== 'undefined');
    }

    private async *linkPaginate(args: UserProvidedProxyConfiguration, updatedBodyOrParams: Record<string, any>, paginateInBody: boolean) {
        const linkPagination = args.paginate as LinkPagination;

        if (paginateInBody) {
            args.data = updatedBodyOrParams;
        } else {
            args.params = updatedBodyOrParams;
        }

        while (true) {
            const response = await this.proxyData(args);

            if (!response.headers) {
                const data = response.data;
                const paginate = args.paginate as Pagination;

                if (Array.isArray(data)) {
                    yield data;
                }
                if (paginate && paginate.response_path) {
                    yield data[paginate.response_path];
                } else {
                    const keys = Object.keys(data);
                    for (const key of keys) {
                        if (Array.isArray(data[key])) {
                            yield data[key];
                        }
                    }
                }
                return;
            }

            const data = response.data;
            const responseData = linkPagination.response_path ? data[linkPagination.response_path] : data;

            if (!responseData.length) {
                return;
            }

            yield responseData;

            const nextPageLink: string | undefined = this.getNextPageLinkFromBodyOrHeaders(linkPagination, response, args.paginate as Pagination);
            if (!nextPageLink) {
                return;
            }

            if (!isValidHttpUrl(nextPageLink)) {
                args.endpoint = nextPageLink;
            } else {
                const url: URL = new URL(nextPageLink);
                args.endpoint = url.pathname + url.search;
            }

            args.params = {};
        }
    }

    private getNextPageLinkFromBodyOrHeaders(linkPagination: LinkPagination, response: MockResponse, paginationConfig: Pagination) {
        if (linkPagination.link_rel_in_response_header) {
            const linkHeader = parseLinksHeader(response.headers['link']);
            return linkHeader?.[linkPagination.link_rel_in_response_header]?.url;
        } else if (linkPagination.link_path_in_response_body) {
            return get(response.data, linkPagination.link_path_in_response_body);
        }

        throw Error(`Either 'link_rel_in_response_header' or 'link_path_in_response_body' should be specified for '${paginationConfig.type}' pagination`);
    }

    private async *offsetPaginate(args: UserProvidedProxyConfiguration, updatedBodyOrParams: Record<string, any>, paginateInBody: boolean) {
        const offsetPagination = args.paginate as OffsetPagination;
        const offsetParameterName: string = offsetPagination.offset_name_in_request;
        const offsetCalculationMethod: OffsetCalculationMethod = offsetPagination.offset_calculation_method || 'by-response-size';

        let offset = offsetPagination.offset_start_value || 0;

        while (true) {
            updatedBodyOrParams[offsetParameterName] = paginateInBody ? offset : String(offset);

            if (paginateInBody) {
                args.data = updatedBodyOrParams;
            } else {
                args.params = updatedBodyOrParams;
            }

            const response = await this.proxyData(args);

            if (!response.headers) {
                const data = response.data;
                const paginate = args.paginate as Pagination;

                if (Array.isArray(data)) {
                    yield data;
                }
                if (paginate && paginate.response_path) {
                    yield data[paginate.response_path];
                } else {
                    const keys = Object.keys(data);
                    for (const key of keys) {
                        if (Array.isArray(data[key])) {
                            yield data[key];
                        }
                    }
                }
                return;
            }

            const responseData = args.paginate?.response_path ? get(response.data, args.paginate?.response_path) : response.data;
            if (!responseData || !responseData.length) {
                return;
            }

            yield responseData;

            if (args.paginate?.limit && responseData.length < args.paginate?.limit) {
                return;
            }

            if (responseData.length < 1) {
                return;
            }

            if (offsetCalculationMethod === 'per-page') {
                offset++;
            } else {
                offset += responseData.length;
            }
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
        const cached = await (await this.fixtureProvider).getCachedResponse(identity);

        return { data: cached.response, headers: cached.headers, status: cached.status };
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

function isValidHttpUrl(str: string) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function get(obj: any, path: string, defaultValue: any = undefined) {
    const pathArray = path.split('.').filter(Boolean);
    const result = pathArray.reduce((acc, part) => acc && acc[part], obj);
    return result === undefined ? defaultValue : result;
}

export type { FixtureProvider };
export { LegacyFixtureProvider, NangoActionMock, NangoSyncMock, RecordingFixtureProvider, UnifiedFixtureProvider };
