import { Buffer } from 'node:buffer';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as url from 'node:url';
import * as vm from 'node:vm';

import { AxiosError } from 'axios';
import { serializeError } from 'serialize-error';
import * as unzipper from 'unzipper';
import * as zod from 'zod';

import { Nango } from '@nangohq/node';
import { ActionError, BASE_VARIANT, NangoActionBase, NangoSyncBase, SDKError } from '@nangohq/runner-sdk';
import * as nangoScript from '@nangohq/runner-sdk';

import type { AdminAxiosProps, ListRecordsRequestConfig } from '@nangohq/node';
import type { ProxyConfiguration, ZodCheckpoint } from '@nangohq/runner-sdk';
import type { Checkpoint, GetPublicConnection, Metadata, NangoProps, SfProxyCall, SfSyncDryRunChanges, UserLogParameters } from '@nangohq/types';
import type { AxiosError as AxiosErrorType, AxiosResponse } from 'axios';

const require = createRequire(import.meta.url);

const filterHeaders = new Set([
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
]);

export type DryRunExecutionResult =
    | {
          success: true;
          response:
              | {
                    functionType: 'action';
                    output: unknown;
                    proxyCalls: SfProxyCall[];
                    logs: unknown[];
                }
              | {
                    functionType: 'sync';
                    changes: SfSyncDryRunChanges;
                    proxyCalls: SfProxyCall[];
                };
      }
    | {
          success: false;
          error: {
              type: string;
              payload: Record<string, unknown>;
              status: number;
              stacktrace?: string[];
          };
      };

interface ScriptExports {
    default?: unknown;
    onWebhookPayloadReceived?: unknown;
}

interface DryRunParams {
    code: string;
    compiledScriptPath: string;
    nangoProps: NangoProps;
    testInput?: unknown;
    metadata?: Metadata | undefined;
    checkpoint?: Checkpoint | undefined;
}

export async function executeDryRun({ code, compiledScriptPath, nangoProps, testInput, metadata, checkpoint }: DryRunParams): Promise<DryRunExecutionResult> {
    const responseCollector = new ProxyCallCollector();
    const nangoPropsWithCollector: NangoProps = {
        ...nangoProps,
        axios: {
            response: {
                onFulfilled: (response) => responseCollector.onAxiosRequestFulfilled(response),
                onRejected: (error: unknown) => responseCollector.onAxiosRequestRejected(error) as Promise<AxiosErrorType>
            }
        }
    };

    const wrappedCode = `(function() { var module = { exports: {} }; var exports = module.exports; ${code}\nreturn module.exports; })();`;
    const optionalModules = {
        soap: loadOptionalModule('soap'),
        botbuilder: loadOptionalModule('botbuilder')
    };

    try {
        const script = new vm.Script(wrappedCode, {
            filename: compiledScriptPath
        });

        const sandbox: vm.Context = {
            console: new Proxy(
                {},
                {
                    get: () => () => {}
                }
            ),
            require: (moduleName: string) => {
                switch (moduleName) {
                    case 'url':
                    case 'node:url':
                        return url;
                    case 'crypto':
                    case 'node:crypto':
                        return crypto;
                    case 'nango':
                        return nangoScript;
                    case 'zod':
                        return zod;
                    case 'unzipper':
                        return unzipper;
                    case 'soap':
                    case 'botbuilder': {
                        const loaded = optionalModules[moduleName];
                        if (!loaded) {
                            throw new Error(`Module '${moduleName}' is unavailable in this environment`);
                        }
                        return loaded;
                    }
                    default:
                        throw new Error(`Module '${moduleName}' is not allowed`);
                }
            },
            Buffer,
            setTimeout,
            Error,
            URL,
            URLSearchParams
        };

        const context = vm.createContext(sandbox);
        const scriptExports = script.runInContext(context) as ScriptExports;
        const exported = scriptExports.default;

        if (!exported) {
            return {
                success: false,
                error: {
                    type: 'script_internal_error',
                    payload: { message: 'There is no default export in the deployed function' },
                    status: 500
                }
            };
        }

        if (nangoProps.scriptType === 'action') {
            const nango = new NangoActionDryRun(nangoPropsWithCollector, { stubbedCheckpoint: checkpoint });
            const output = await runAction({ exported, nango, input: testInput });
            return {
                success: true,
                response: {
                    functionType: 'action',
                    output,
                    proxyCalls: responseCollector.getCalls(),
                    logs: nango.logs
                }
            };
        }

        const nango = new NangoSyncDryRun(nangoPropsWithCollector, { stubbedMetadata: metadata, stubbedCheckpoint: checkpoint });
        await runSync({ exported, nango });
        return {
            success: true,
            response: {
                functionType: 'sync',
                changes: {
                    counts: nango.logMessages.counts,
                    logs: nango.logMessages.messages,
                    batchSave: mapToObject(nango.rawSaveOutput),
                    batchUpdate: mapToObject(nango.rawUpdateOutput),
                    batchDelete: mapToObject(nango.rawDeleteOutput)
                },
                proxyCalls: responseCollector.getCalls()
            }
        };
    } catch (err) {
        if (err instanceof ActionError) {
            return {
                success: false,
                error: {
                    type: err.type,
                    payload: err.payload || {},
                    status: 500
                }
            };
        }

        if (err instanceof SDKError) {
            return {
                success: false,
                error: {
                    type: err.code,
                    payload: err.payload || {},
                    status: 500
                }
            };
        }

        if (err instanceof AxiosError) {
            if (err.response?.data) {
                const payload =
                    typeof err.response.data === 'object' && err.response.data !== null
                        ? (err.response.data as Record<string, unknown>)
                        : { message: err.response.data };
                return {
                    success: false,
                    error: {
                        type: 'script_http_error',
                        payload,
                        status: err.response.status
                    }
                };
            }

            const serialized = serializeError(err);
            return {
                success: false,
                error: {
                    type: 'script_http_error',
                    payload: {
                        name: serialized.name || 'Error',
                        code: serialized.code,
                        message: serialized.message
                    },
                    status: 500
                }
            };
        }

        const serialized = serializeError(!err || typeof err !== 'object' ? new Error(JSON.stringify(err)) : err);
        const stacktrace = formatStackTrace(serialized.stack, compiledScriptPath);
        return {
            success: false,
            error: {
                type: 'script_internal_error',
                payload: {
                    name: serialized.name || 'Error',
                    code: serialized.code,
                    message: serialized.message
                },
                ...(stacktrace.length > 0 ? { stacktrace } : {}),
                status: 500
            }
        };
    }
}

class NangoActionDryRun extends NangoActionBase<never, ZodCheckpoint> {
    nango: Nango;
    logs: unknown[] = [];
    private stubbedCheckpoint?: Checkpoint | undefined;

    constructor(props: NangoProps, options: { stubbedCheckpoint?: Checkpoint | undefined }) {
        super(props);
        this.stubbedCheckpoint = options.stubbedCheckpoint;
        this.nango = new Nango({ isSync: false, dryRun: true, isScript: true, ...props }, getAxiosSettings(props));
    }

    public override async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        if (!config.method) {
            config.method = 'GET';
        }

        const res = await this.nango.proxy(config);
        if (res instanceof AxiosError) {
            throw res;
        }
        return res;
    }

    public override log(...args: [...any]): void {
        if (args.length === 0) {
            return;
        }

        const lastArg = args[args.length - 1];
        const isUserDefinedLevel = (object: UserLogParameters): boolean => {
            return Boolean(lastArg && typeof lastArg === 'object' && 'level' in object);
        };
        const userDefinedLevel: UserLogParameters | undefined = isUserDefinedLevel(lastArg) ? lastArg : undefined;

        if (userDefinedLevel) {
            args.pop();
        }

        this.logs.push({
            level: userDefinedLevel?.level || 'info',
            message: args[0],
            payload: args[1]
        });
    }

    public triggerSync(
        _providerConfigKey: string,
        _connectionId: string,
        _sync: string | { name: string; variant: string },
        _syncMode?: unknown
    ): Promise<void> {
        return Promise.resolve();
    }

    public startSync(_providerConfigKey: string, _syncs: (string | { name: string; variant: string })[], _connectionId?: string): Promise<void> {
        return Promise.resolve();
    }

    public override tryAcquireLock(_props: { key: string; ttlMs: number }): Promise<boolean> {
        return Promise.resolve(true);
    }

    public override releaseLock(_props: { key: string }): Promise<boolean> {
        return Promise.resolve(true);
    }

    public override releaseAllLocks(): Promise<void> {
        return Promise.resolve();
    }

    public override getCheckpoint(): Promise<Checkpoint | null> {
        return Promise.resolve(this.stubbedCheckpoint || null);
    }

    public override saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
        this.stubbedCheckpoint = checkpoint;
        return Promise.resolve();
    }

    public override clearCheckpoint(): Promise<void> {
        this.stubbedCheckpoint = undefined;
        return Promise.resolve();
    }
}

class NangoSyncDryRun extends NangoSyncBase<never, never, ZodCheckpoint> {
    nango: Nango;

    logMessages: { counts: SfSyncDryRunChanges['counts']; messages: unknown[] } = {
        counts: {
            added: 0,
            updated: 0,
            deleted: 0
        },
        messages: []
    };

    rawSaveOutput = new Map<string, unknown[]>();
    rawUpdateOutput = new Map<string, unknown[]>();
    rawDeleteOutput = new Map<string, unknown[]>();
    stubbedMetadata?: Metadata | undefined = undefined;
    private stubbedCheckpoint?: Checkpoint | undefined = undefined;

    constructor(props: NangoProps, options: { stubbedMetadata?: Metadata | undefined; stubbedCheckpoint?: Checkpoint | undefined }) {
        super(props);

        this.stubbedMetadata = options.stubbedMetadata;
        this.stubbedCheckpoint = options.stubbedCheckpoint;
        this.nango = new Nango({ isSync: true, dryRun: true, isScript: true, ...props }, getAxiosSettings(props));
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    proxy = NangoActionDryRun.prototype.proxy;
    log = (...args: Parameters<NangoActionDryRun['log']>) => NangoActionDryRun.prototype.log.call(this, ...args);
    triggerSync = (...args: Parameters<NangoActionDryRun['triggerSync']>) => NangoActionDryRun.prototype.triggerSync.call(this, ...args);
    startSync = (...args: Parameters<NangoActionDryRun['startSync']>) => NangoActionDryRun.prototype.startSync.call(this, ...args);
    tryAcquireLock = (...args: Parameters<NangoActionDryRun['tryAcquireLock']>) => NangoActionDryRun.prototype.tryAcquireLock.call(this, ...args);
    releaseLock = (...args: Parameters<NangoActionDryRun['releaseLock']>) => NangoActionDryRun.prototype.releaseLock.call(this, ...args);
    releaseAllLocks = (...args: Parameters<NangoActionDryRun['releaseAllLocks']>) => NangoActionDryRun.prototype.releaseAllLocks.call(this, ...args);

    public override getCheckpoint(): Promise<Checkpoint | null> {
        return Promise.resolve(this.stubbedCheckpoint || null);
    }

    public override saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
        this.stubbedCheckpoint = checkpoint;
        return Promise.resolve();
    }

    public override clearCheckpoint(): Promise<void> {
        this.stubbedCheckpoint = undefined;
        return Promise.resolve();
    }

    public batchSave<T extends object>(results: T[], model: string): boolean {
        if (!results || results.length === 0) {
            return true;
        }

        const seenIds = new Set<string | number>();
        const deduplicatedResults: (T & { id: string | number })[] = [];

        for (let i = results.length - 1; i >= 0; i--) {
            const record = results[i] as T & { id: string | number };
            if (!seenIds.has(record.id)) {
                seenIds.add(record.id);
                deduplicatedResults.unshift(record);
            }
        }

        const resultsWithoutMetadata = this.removeMetadata(deduplicatedResults);
        const modelFullName = this.modelFullName(model);

        this.logMessages.messages.push(
            `A batch save call would save data to ${modelFullName}${this.variant === BASE_VARIANT ? '' : ` (variant: ${this.variant})`}`
        );
        this.logMessages.messages.push(...resultsWithoutMetadata);
        this.logMessages.counts.added += deduplicatedResults.length;

        if (!this.rawSaveOutput.has(modelFullName)) {
            this.rawSaveOutput.set(modelFullName, []);
        }
        this.rawSaveOutput.get(modelFullName)?.push(...deduplicatedResults);
        return true;
    }

    public batchDelete<T extends object>(results: T[], model: string): boolean {
        if (!results || results.length === 0) {
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);
        const modelFullName = this.modelFullName(model);

        this.logMessages.messages.push(`A batch delete call would delete data from ${modelFullName}`);
        this.logMessages.messages.push(...resultsWithoutMetadata);
        this.logMessages.counts.deleted += results.length;

        if (!this.rawDeleteOutput.has(modelFullName)) {
            this.rawDeleteOutput.set(modelFullName, []);
        }
        this.rawDeleteOutput.get(modelFullName)?.push(...results);
        return true;
    }

    public batchUpdate<T extends object>(results: T[], model: string): boolean {
        if (!results || results.length === 0) {
            return true;
        }

        const resultsWithoutMetadata = this.removeMetadata(results);
        const modelFullName = this.modelFullName(model);

        this.logMessages.messages.push(
            `A batch update call would update data in ${modelFullName}${this.variant === BASE_VARIANT ? '' : ` (variant: ${this.variant})`}`
        );
        this.logMessages.messages.push(...resultsWithoutMetadata);
        this.logMessages.counts.updated += results.length;

        if (!this.rawUpdateOutput.has(modelFullName)) {
            this.rawUpdateOutput.set(modelFullName, []);
        }
        this.rawUpdateOutput.get(modelFullName)?.push(...results);
        return true;
    }

    public override getMetadata<TMetadata = Metadata>(): Promise<TMetadata> {
        if (this.stubbedMetadata) {
            return Promise.resolve(this.stubbedMetadata as TMetadata);
        }

        return super.getMetadata<TMetadata>();
    }

    public override async getConnection(
        providerConfigKeyOverride?: string,
        connectionIdOverride?: string,
        options?: { refreshToken?: boolean; refreshGithubAppJwtToken?: boolean; forceRefresh?: boolean }
    ): Promise<GetPublicConnection['Success']> {
        const fetchedConnection = await super.getConnection(providerConfigKeyOverride, connectionIdOverride, options);
        if (this.stubbedMetadata) {
            return { ...fetchedConnection, metadata: this.stubbedMetadata };
        }

        return fetchedConnection;
    }

    public override async getRecordsByIds<K = string | number, T = any>(ids: K[], model: string): Promise<Map<K, T>> {
        const objects = new Map<K, T>();

        if (ids.length === 0) {
            return objects;
        }

        const externalIds = ids.map((id) => String(id).replaceAll('\x00', ''));
        const externalIdMap = new Map<string, K>(ids.map((id) => [String(id), id]));

        let cursor: string | null = null;
        for (let i = 0; i < ids.length; i += 100) {
            const batchIds = externalIds.slice(i, i + 100);

            const props: ListRecordsRequestConfig = {
                providerConfigKey: this.providerConfigKey,
                connectionId: this.connectionId,
                model: this.modelFullName(model),
                ids: batchIds
            };
            if (cursor) {
                props.cursor = cursor;
            }

            const response = await this.nango.listRecords<any>(props);

            const batchRecords = response.records;
            cursor = response.next_cursor;

            for (const record of batchRecords) {
                const stringId = String(record.id);
                const realId = externalIdMap.get(stringId);
                if (realId !== undefined) {
                    objects.set(realId, record as T);
                }
            }
        }

        return objects;
    }

    public override async *listRecords<T extends object = any>(model: string, options?: { cursor?: string }): AsyncGenerator<T> {
        let cursor: string | null | undefined = options?.cursor;
        do {
            const props: ListRecordsRequestConfig = {
                providerConfigKey: this.providerConfigKey,
                connectionId: this.connectionId,
                model: this.modelFullName(model),
                ...(cursor ? { cursor } : {})
            };
            const response = await this.nango.listRecords<any>(props);
            for (const record of response.records) {
                yield record as T;
            }
            cursor = response.next_cursor;
        } while (cursor);
    }

    public override async setMergingStrategy(_merging: { strategy: 'ignore_if_modified_after' | 'override' }, _model: string): Promise<void> {
        return Promise.resolve();
    }

    public override async deleteRecordsFromPreviousExecutions(_model: string): Promise<{ deletedKeys: string[] }> {
        return Promise.resolve({ deletedKeys: [] });
    }

    public override async trackDeletesStart(_model: string): Promise<void> {
        return Promise.resolve();
    }

    public override async trackDeletesEnd(_model: string): Promise<{ deletedKeys: string[] }> {
        return Promise.resolve({ deletedKeys: [] });
    }
}

class ProxyCallCollector {
    private calls: SfProxyCall[] = [];

    public onAxiosRequestFulfilled(response: AxiosResponse): AxiosResponse {
        this.calls.push(formatAxiosResponse(response));
        return response;
    }

    public onAxiosRequestRejected(error: unknown): Promise<never> {
        const response: AxiosResponse | undefined = (error as AxiosErrorType).response;
        if (response) {
            this.calls.push(formatAxiosResponse(response));
        }

        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    public getCalls(): SfProxyCall[] {
        return this.calls;
    }
}

async function runAction({ exported, nango, input }: { exported: unknown; nango: NangoActionDryRun; input: unknown }): Promise<unknown> {
    if (typeof exported === 'object' && exported !== null) {
        const payload = exported as Record<string, unknown>;
        if (payload['type'] !== 'action') {
            throw new Error('Incorrect script loaded for action');
        }
        if (typeof payload['exec'] !== 'function') {
            throw new Error('Missing exec function for action');
        }
        return await (payload['exec'] as (nango: NangoActionDryRun, input: unknown) => Promise<unknown>)(nango, input);
    }

    if (typeof exported === 'function') {
        const fn = exported as (nango: NangoActionDryRun, input?: unknown) => Promise<unknown>;
        return await fn(nango, input);
    }

    throw new Error('Invalid default export for action');
}

async function runSync({ exported, nango }: { exported: unknown; nango: NangoSyncDryRun }): Promise<void> {
    if (typeof exported === 'object' && exported !== null) {
        const payload = exported as Record<string, unknown>;
        if (payload['type'] !== 'sync') {
            throw new Error('Incorrect script loaded for sync');
        }
        if (typeof payload['exec'] !== 'function') {
            throw new Error('Missing exec function for sync');
        }
        await (payload['exec'] as (nango: NangoSyncDryRun) => Promise<void>)(nango);
        return;
    }

    if (typeof exported === 'function') {
        const fn = exported as (nango: NangoSyncDryRun) => Promise<void>;
        await fn(nango);
        return;
    }

    throw new Error('Invalid default export for sync');
}

function getAxiosSettings(props: NangoProps): AdminAxiosProps {
    const axiosSettings: AdminAxiosProps = {
        userAgent: 'sdk'
    };

    if (props.axios?.response) {
        axiosSettings.interceptors = {
            response: {
                onFulfilled: props.axios.response.onFulfilled,
                onRejected: props.axios.response.onRejected
            }
        };
    }

    return axiosSettings;
}

function loadOptionalModule(moduleName: 'soap' | 'botbuilder'): unknown {
    try {
        return require(moduleName);
    } catch {
        return null;
    }
}

function mapToObject(map: Map<string, unknown[]>): Record<string, unknown[]> {
    return Object.fromEntries(map.entries());
}

function formatStackTrace(stack: string | undefined, filename: string): string[] {
    if (!stack) {
        return [];
    }

    return stack
        .split('\n')
        .filter((s, i) => i === 0 || s.includes(filename))
        .map((s) => s.trim())
        .slice(0, 10);
}

function formatAxiosResponse(response: AxiosResponse): SfProxyCall {
    const requestUrl = response.config.url || '';
    const endpoint = parseEndpoint(requestUrl);
    const params = parseParams(requestUrl);
    const headers = filterRequestHeaders(response.config.headers || {});

    return {
        method: (response.config.method || 'get').toUpperCase(),
        endpoint,
        status: response.status,
        request: {
            ...(Object.keys(params).length > 0 ? { params } : {}),
            ...(Object.keys(headers).length > 0 ? { headers } : {}),
            ...(response.config.data ? { data: response.config.data } : {})
        },
        response: response.data,
        headers: normalizeResponseHeaders(response.headers as Record<string, unknown>)
    };
}

function parseEndpoint(rawUrl: string): string {
    try {
        const parsed = new URL(rawUrl);
        const endpoint = parsed.pathname.replace(/^\/proxy\//, '/');
        return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    } catch {
        const endpoint = rawUrl.replace(/^.*\/proxy\//, '/');
        return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    }
}

function parseParams(rawUrl: string): Record<string, string> {
    try {
        const parsed = new URL(rawUrl);
        return Object.fromEntries(Array.from(parsed.searchParams.entries()));
    } catch {
        return {};
    }
}

function filterRequestHeaders(input: Record<string, unknown>): Record<string, unknown> {
    const headers: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        const normalized = key.toLowerCase().startsWith('nango-proxy-') ? key.slice(12) : key;
        const lower = normalized.toLowerCase();
        if (filterHeaders.has(lower)) {
            continue;
        }
        const stringValue = String(value);
        if (isAxiosDefaultContentType(lower, stringValue)) {
            continue;
        }
        headers[normalized] = value;
    }

    return headers;
}

function normalizeResponseHeaders(input: Record<string, unknown>): Record<string, string> {
    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
        output[key] = String(value);
    }
    return output;
}

function isAxiosDefaultContentType(headerKey: string, headerValue: string): boolean {
    if (headerKey !== 'content-type') {
        return false;
    }

    const normalized = headerValue.toLowerCase();
    return normalized === 'application/json' || normalized === 'undefined' || normalized.startsWith('application/x-www-form-urlencoded');
}
