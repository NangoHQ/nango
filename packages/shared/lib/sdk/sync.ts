import https from 'node:https';
import { Nango, getUserAgent } from '@nangohq/node';
import configService from '../services/config.service.js';
import paginateService from '../services/paginate.service.js';
import proxyService from '../services/proxy.service.js';
import type { AxiosInstance } from 'axios';
import axios, { AxiosError } from 'axios';
import { getPersistAPIUrl } from '../utils/utils.js';
import type { IntegrationWithCreds } from '@nangohq/node';
import type { UserProvidedProxyConfiguration } from '../models/Proxy.js';
import { getLogger, httpRetryStrategy, metrics, retryWithBackoff } from '@nangohq/utils';
import type { SyncConfig } from '../models/Sync.js';
import type { RunnerFlags } from '../services/sync/run.utils.js';
import { validateData } from './dataValidation.js';
import { NangoError } from '../utils/error.js';
import { stringifyAndTruncateLog } from './utils.js';

const logger = getLogger('SDK');

/*
 *
 * NOTICE!!
 * This file is imported from the cli so any type needs to be explicitly
 * specified in this file because imports won't resolve when copying
 * over this file to the cli
 *
 */

type LogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';
const logLevelToLogger = {
    info: 'info',
    debug: 'debug',
    error: 'error',
    warn: 'warning',
    http: 'info',
    verbose: 'debug',
    silly: 'debug'
} as const;

type ParamEncoder = (value: any, defaultEncoder: (value: any) => any) => any;

interface GenericFormData {
    append(name: string, value: any, options?: any): any;
}

type SerializerVisitor = (
    this: GenericFormData,
    value: any,
    key: string | number,
    path: null | (string | number)[],
    helpers: FormDataVisitorHelpers
) => boolean;

type CustomParamsSerializer = (params: Record<string, any>, options?: ParamsSerializerOptions) => string;

interface FormDataVisitorHelpers {
    defaultVisitor: SerializerVisitor;
    convertValue: (value: any) => any;
    isVisitable: (value: any) => boolean;
}

interface SerializerOptions {
    visitor?: SerializerVisitor;
    dots?: boolean;
    metaTokens?: boolean;
    indexes?: boolean | null;
}

interface ParamsSerializerOptions extends SerializerOptions {
    encode?: ParamEncoder;
    serialize?: CustomParamsSerializer;
}

export interface AxiosResponse<T = any, D = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: D;
    request?: any;
}

interface UserLogParameters {
    level?: LogLevel;
}

enum PaginationType {
    CURSOR = 'cursor',
    LINK = 'link',
    OFFSET = 'offset'
}

interface Pagination {
    type: string;
    limit?: number;
    response_path?: string;
    limit_name_in_request: string;
}

interface CursorPagination extends Pagination {
    cursor_path_in_response: string;
    cursor_name_in_request: string;
}

interface LinkPagination extends Pagination {
    link_rel_in_response_header?: string;
    link_path_in_response_body?: string;
}

interface OffsetPagination extends Pagination {
    offset_name_in_request: string;
}

interface RetryHeaderConfig {
    at?: string;
    after?: string;
}

export interface ProxyConfiguration {
    endpoint: string;
    providerConfigKey?: string;
    connectionId?: string;

    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    headers?: Record<string, string>;
    params?: string | Record<string, string | number>;
    paramsSerializer?: ParamsSerializerOptions;
    data?: unknown;
    retries?: number;
    baseUrlOverride?: string;
    paginate?: Partial<CursorPagination> | Partial<LinkPagination> | Partial<OffsetPagination>;
    retryHeader?: RetryHeaderConfig;
    responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
    retryOn?: number[] | null;
}

export interface AuthModes {
    OAuth1: 'OAUTH1';
    OAuth2: 'OAUTH2';
    OAuth2CC: 'OAUTH2_CC';
    Basic: 'BASIC';
    ApiKey: 'API_KEY';
    AppStore: 'APP_STORE';
    Custom: 'CUSTOM';
    App: 'APP';
    None: 'NONE';
    TBA: 'TBA';
}
export type AuthModeType = AuthModes[keyof AuthModes];

interface OAuth1Token {
    oAuthToken: string;
    oAuthTokenSecret: string;
}

interface AppCredentials {
    type: AuthModes['App'];
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
}

interface AppStoreCredentials {
    type?: AuthModes['AppStore'];
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
    private_key: string;
}

interface BasicApiCredentials {
    type: AuthModes['Basic'];
    username: string;
    password: string;
}

interface ApiKeyCredentials {
    type: AuthModes['ApiKey'];
    apiKey: string;
}

interface CredentialsCommon<T = Record<string, any>> {
    type: AuthModeType;
    raw: T;
}

interface OAuth2Credentials extends CredentialsCommon {
    type: AuthModes['OAuth2'];
    access_token: string;

    refresh_token?: string;
    expires_at?: Date | undefined;
}

interface OAuth2ClientCredentials extends CredentialsCommon {
    type: AuthModes['OAuth2CC'];
    token: string;

    expires_at?: Date | undefined;

    client_id: string;
    client_secret: string;
}

interface OAuth1Credentials extends CredentialsCommon {
    type: AuthModes['OAuth1'];
    oauth_token: string;
    oauth_token_secret: string;
}

interface TbaCredentials {
    type: AuthModes['TBA'];
    token_id: string;
    token_secret: string;

    config_override: {
        client_id?: string;
        client_secret?: string;
    };
}
interface CustomCredentials extends CredentialsCommon {
    type: AuthModes['Custom'];
}

type UnauthCredentials = Record<string, never>;

type AuthCredentials =
    | OAuth2Credentials
    | OAuth2ClientCredentials
    | OAuth1Credentials
    | BasicApiCredentials
    | ApiKeyCredentials
    | AppCredentials
    | AppStoreCredentials
    | UnauthCredentials
    | TbaCredentials
    | CustomCredentials;

type Metadata = Record<string, unknown>;

interface MetadataChangeResponse {
    metadata: Metadata;
    provider_config_key: string;
    connection_id: string | string[];
}

interface Connection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata?: Metadata | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: AuthCredentials;
}

export class ActionError<T = Record<string, unknown>> extends Error {
    type: string;
    payload?: Record<string, unknown>;

    constructor(payload?: T) {
        super();
        this.type = 'action_script_runtime_error';
        if (payload) {
            this.payload = payload;
        }
    }
}

interface RunArgs {
    sync: string;
    connectionId: string;
    lastSyncDate?: string;
    useServerLastSyncDate?: boolean;
    input?: object;
    metadata?: Metadata;
    autoConfirm: boolean;
    debug: boolean;
    optionalEnvironment?: string;
    optionalProviderConfigKey?: string;
}

export interface DryRunServiceInterface {
    run: (options: RunArgs, debug?: boolean) => Promise<string | void>;
}

export interface NangoProps {
    host?: string;
    secretKey: string;
    accountId?: number;
    connectionId: string;
    environmentId?: number;
    environmentName?: string;
    activityLogId?: number | string | undefined;
    providerConfigKey: string;
    provider?: string;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    nangoConnectionId?: number;
    syncJobId?: number | undefined;
    dryRun?: boolean;
    track_deletes?: boolean;
    attributes?: object | undefined;
    logMessages?: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } | undefined;
    stubbedMetadata?: Metadata | undefined;
    abortSignal?: AbortSignal;
    dryRunService?: DryRunServiceInterface;
    syncConfig: SyncConfig;
    runnerFlags: RunnerFlags;
}

export interface EnvironmentVariable {
    name: string;
    value: string;
}

const MEMOIZED_CONNECTION_TTL = 60000;

export const defaultPersistApi = axios.create({
    baseURL: getPersistAPIUrl(),
    httpsAgent: new https.Agent({ keepAlive: true }),
    headers: {
        'User-Agent': getUserAgent('sdk')
    },
    validateStatus: (_status) => {
        return true;
    }
});

export class NangoAction {
    protected nango: Nango;
    private attributes = {};
    protected persistApi: AxiosInstance;
    activityLogId?: number | string | undefined;
    syncId?: string;
    nangoConnectionId?: number;
    environmentId?: number;
    environmentName?: string;
    syncJobId?: number;
    dryRun?: boolean;
    abortSignal?: AbortSignal;
    dryRunService?: DryRunServiceInterface;
    syncConfig?: SyncConfig;
    runnerFlags: RunnerFlags;

    public connectionId: string;
    public providerConfigKey: string;
    public provider?: string;

    public ActionError = ActionError;

    private memoizedConnections: Map<string, { connection: Connection; timestamp: number } | undefined> = new Map<
        string,
        { connection: Connection; timestamp: number }
    >();
    private memoizedIntegration: IntegrationWithCreds | undefined;

    constructor(config: NangoProps, { persistApi }: { persistApi: AxiosInstance } = { persistApi: defaultPersistApi }) {
        this.connectionId = config.connectionId;
        this.providerConfigKey = config.providerConfigKey;
        this.persistApi = persistApi;
        this.runnerFlags = config.runnerFlags;

        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }

        this.nango = new Nango({ isSync: true, ...config }, { userAgent: 'sdk' });

        if (config.syncId) {
            this.syncId = config.syncId;
        }

        if (config.nangoConnectionId) {
            this.nangoConnectionId = config.nangoConnectionId;
        }

        if (config.syncJobId) {
            this.syncJobId = config.syncJobId;
        }

        if (config.dryRun) {
            this.dryRun = config.dryRun;
        }

        if (config.environmentId) {
            this.environmentId = config.environmentId;
        }

        if (config.environmentName) {
            this.environmentName = config.environmentName;
        }

        if (config.provider) {
            this.provider = config.provider;
        }

        if (config.attributes) {
            this.attributes = config.attributes;
        }

        if (config.abortSignal) {
            this.abortSignal = config.abortSignal;
        }

        if (config.dryRunService) {
            this.dryRunService = config.dryRunService;
        }

        if (config.syncConfig) {
            this.syncConfig = config.syncConfig;
        }

        if (this.dryRun !== true) {
            if (!this.activityLogId) throw new Error('Parameter activityLogId is required when not in dryRun');
            if (!this.environmentId) throw new Error('Parameter environmentId is required when not in dryRun');
            if (!this.nangoConnectionId) throw new Error('Parameter nangoConnectionId is required when not in dryRun');
            if (!this.syncConfig) throw new Error('Parameter syncConfig is required when not in dryRun');
        }
    }

    protected stringify(): string {
        return JSON.stringify(this, (key, value) => {
            if (key === 'secretKey') {
                return '********';
            }
            return value;
        });
    }

    private proxyConfig(config: ProxyConfiguration): UserProvidedProxyConfiguration {
        if (!config.connectionId && this.connectionId) {
            config.connectionId = this.connectionId;
        }
        if (!config.providerConfigKey && this.providerConfigKey) {
            config.providerConfigKey = this.providerConfigKey;
        }
        if (!config.connectionId) {
            throw new Error('Missing connection id');
        }
        if (!config.providerConfigKey) {
            throw new Error('Missing provider config key');
        }
        return {
            ...config,
            providerConfigKey: config.providerConfigKey,
            connectionId: config.connectionId,
            headers: {
                ...(config.headers || {}),
                'user-agent': this.nango.userAgent
            }
        };
    }

    protected exitSyncIfAborted(): void {
        if (this.abortSignal?.aborted) {
            process.exit(0);
        }
    }

    public async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        this.exitSyncIfAborted();
        if (this.dryRun) {
            return this.nango.proxy(config);
        } else {
            const { connectionId, providerConfigKey } = config;
            const connection = await this.getConnection(providerConfigKey, connectionId);
            if (!connection) {
                throw new Error(`Connection not found using the provider config key ${this.providerConfigKey} and connection id ${this.connectionId}`);
            }

            const proxyConfig = this.proxyConfig(config);

            const { response, logs } = await proxyService.route(proxyConfig, {
                existingActivityLogId: this.activityLogId as string,
                connection,
                provider: this.provider as string
            });

            // We batch save, since we have buffered the createdAt it shouldn't impact order
            await Promise.all(
                logs.map(async (log) => {
                    if (log.level === 'debug') {
                        return;
                    }
                    await this.sendLogToPersist(log.message, { level: log.level, timestamp: new Date(log.createdAt).getTime() });
                })
            );

            if (response instanceof Error) {
                throw response;
            }

            return response;
        }
    }

    public async get<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'GET'
        });
    }

    public async post<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'POST'
        });
    }

    public async put<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'PUT'
        });
    }

    public async patch<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'PATCH'
        });
    }

    public async delete<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'DELETE'
        });
    }

    public async getToken(): Promise<
        | string
        | OAuth1Token
        | OAuth2ClientCredentials
        | BasicApiCredentials
        | ApiKeyCredentials
        | AppCredentials
        | AppStoreCredentials
        | UnauthCredentials
        | CustomCredentials
        | TbaCredentials
    > {
        this.exitSyncIfAborted();
        return this.nango.getToken(this.providerConfigKey, this.connectionId);
    }

    public async getConnection(providerConfigKeyOverride?: string, connectionIdOverride?: string): Promise<Connection> {
        this.exitSyncIfAborted();

        const providerConfigKey = providerConfigKeyOverride || this.providerConfigKey;
        const connectionId = connectionIdOverride || this.connectionId;

        const credentialsPair = `${providerConfigKey}${connectionId}`;
        const cachedConnection = this.memoizedConnections.get(credentialsPair);

        if (!cachedConnection || Date.now() - cachedConnection.timestamp > MEMOIZED_CONNECTION_TTL) {
            const connection = await this.nango.getConnection(providerConfigKey, connectionId);
            this.memoizedConnections.set(credentialsPair, { connection, timestamp: Date.now() });
            return connection;
        }

        return cachedConnection.connection;
    }

    public async setMetadata(metadata: Metadata): Promise<AxiosResponse<MetadataChangeResponse>> {
        this.exitSyncIfAborted();
        try {
            return await this.nango.setMetadata(this.providerConfigKey, this.connectionId, metadata);
        } finally {
            this.memoizedConnections.delete(`${this.providerConfigKey}${this.connectionId}`);
        }
    }

    public async updateMetadata(metadata: Metadata): Promise<AxiosResponse<MetadataChangeResponse>> {
        this.exitSyncIfAborted();
        try {
            return await this.nango.updateMetadata(this.providerConfigKey, this.connectionId, metadata);
        } finally {
            this.memoizedConnections.delete(`${this.providerConfigKey}${this.connectionId}`);
        }
    }

    /**
     * @deprecated please use setMetadata instead.
     */
    public async setFieldMapping(fieldMapping: Record<string, string>): Promise<AxiosResponse<object>> {
        logger.warning('setFieldMapping is deprecated. Please use setMetadata instead.');
        return this.setMetadata(fieldMapping);
    }

    public async getMetadata<T = Metadata>(): Promise<T> {
        this.exitSyncIfAborted();
        return (await this.getConnection(this.providerConfigKey, this.connectionId)).metadata as T;
    }

    public async getWebhookURL(): Promise<string | undefined> {
        this.exitSyncIfAborted();
        if (this.memoizedIntegration) {
            return this.memoizedIntegration.webhook_url;
        }

        const { config: integration } = await this.nango.getIntegration(this.providerConfigKey, true);
        if (!integration || !integration.provider) {
            throw Error(`There was no provider found for the provider config key: ${this.providerConfigKey}`);
        }
        this.memoizedIntegration = integration as IntegrationWithCreds;
        return this.memoizedIntegration.webhook_url;
    }

    /**
     * @deprecated please use getMetadata instead.
     */
    public async getFieldMapping(): Promise<Metadata> {
        logger.warning('getFieldMapping is deprecated. Please use getMetadata instead.');
        const metadata = await this.getMetadata();
        return (metadata['fieldMapping'] as Metadata) || {};
    }

    /**
     * Log
     * @desc Log a message to the activity log which shows up in the Nango Dashboard
     * note that the last argument can be an object with a level property to specify the log level
     * @example
     * ```ts
     * await nango.log('This is a log message', { level: 'error' })
     * ```
     */
    public async log(message: any, options?: { level?: LogLevel } | { [key: string]: any; level?: never }): Promise<void>;
    public async log(message: string, ...args: [any, { level?: LogLevel }]): Promise<void>;
    public async log(...args: [...any]): Promise<void> {
        this.exitSyncIfAborted();
        if (args.length === 0) {
            return;
        }

        const lastArg = args[args.length - 1];

        const isUserDefinedLevel = (object: UserLogParameters): boolean => {
            return lastArg && typeof lastArg === 'object' && 'level' in object;
        };

        const userDefinedLevel: UserLogParameters | undefined = isUserDefinedLevel(lastArg) ? lastArg : undefined;

        if (userDefinedLevel) {
            args.pop();
        }

        const level = userDefinedLevel?.level ?? 'info';

        if (this.dryRun) {
            logger[logLevelToLogger[level] ?? 'info'].apply(null, args as any);
            return;
        }

        const content = stringifyAndTruncateLog(args, 99_000);

        await this.sendLogToPersist(content, { level, timestamp: Date.now() });
    }

    public async getEnvironmentVariables(): Promise<EnvironmentVariable[] | null> {
        if (!this.environmentId) {
            throw new Error('There is no current environment to get variables from');
        }

        return await this.nango.getEnvironmentVariables();
    }

    public getFlowAttributes<A = object>(): A | null {
        if (!this.syncJobId) {
            throw new Error('There is no current sync to get attributes from');
        }

        return this.attributes as A;
    }

    public async *paginate<T = any>(config: ProxyConfiguration): AsyncGenerator<T[], undefined, void> {
        const template = configService.getTemplate(this.provider as string);
        const templatePaginationConfig: Pagination | undefined = template.proxy?.paginate;

        if (!templatePaginationConfig && (!config.paginate || !config.paginate.type)) {
            throw Error('There was no pagination configuration for this integration or configuration passed in.');
        }

        const paginationConfig: Pagination = {
            ...(templatePaginationConfig || {}),
            ...(config.paginate || {})
        } as Pagination;

        paginateService.validateConfiguration(paginationConfig);

        config.method = config.method || 'GET';

        const configMethod: string = config.method.toLocaleLowerCase();
        const passPaginationParamsInBody: boolean = ['post', 'put', 'patch'].includes(configMethod);

        const updatedBodyOrParams: Record<string, any> = ((passPaginationParamsInBody ? config.data : config.params) as Record<string, any>) ?? {};
        const limitParameterName: string = paginationConfig.limit_name_in_request;

        if (paginationConfig['limit']) {
            updatedBodyOrParams[limitParameterName] = paginationConfig['limit'];
        }

        const proxyConfig = this.proxyConfig(config);
        switch (paginationConfig.type.toLowerCase()) {
            case PaginationType.CURSOR:
                return yield* paginateService.cursor<T>(
                    proxyConfig,
                    paginationConfig as CursorPagination,
                    updatedBodyOrParams,
                    passPaginationParamsInBody,
                    this.proxy.bind(this)
                );
            case PaginationType.LINK:
                return yield* paginateService.link<T>(proxyConfig, paginationConfig, updatedBodyOrParams, passPaginationParamsInBody, this.proxy.bind(this));
            case PaginationType.OFFSET:
                return yield* paginateService.offset<T>(
                    proxyConfig,
                    paginationConfig as OffsetPagination,
                    updatedBodyOrParams,
                    passPaginationParamsInBody,
                    this.proxy.bind(this)
                );
            default:
                throw Error(`'${paginationConfig.type} ' pagination is not supported. Please, make sure it's one of ${Object.values(PaginationType)}`);
        }
    }

    public async triggerAction<T = object>(providerConfigKey: string, connectionId: string, actionName: string, input?: unknown): Promise<T> {
        return (await this.nango.triggerAction(providerConfigKey, connectionId, actionName, input)) as T;
    }

    public async triggerSync(providerConfigKey: string, connectionId: string, syncName: string, fullResync?: boolean): Promise<void | string> {
        if (this.dryRun && this.dryRunService) {
            return this.dryRunService.run({
                sync: syncName,
                connectionId,
                autoConfirm: true,
                debug: false
            });
        } else {
            return this.nango.triggerSync(providerConfigKey, [syncName], connectionId, fullResync);
        }
    }

    private async sendLogToPersist(content: string, options: { level: LogLevel; timestamp: number }) {
        let response: AxiosResponse;
        try {
            response = await retryWithBackoff(
                async () => {
                    return await this.persistApi({
                        method: 'POST',
                        url: `/environment/${this.environmentId}/log`,
                        headers: {
                            Authorization: `Bearer ${this.nango.secretKey}`
                        },
                        data: {
                            activityLogId: this.activityLogId,
                            level: options.level ?? 'info',
                            timestamp: options.timestamp,
                            msg: content
                        }
                    });
                },
                { retry: httpRetryStrategy }
            );
        } catch (err) {
            logger.error('Failed to log to persist, due to an internal error', err instanceof AxiosError ? err.code : err);
            // We don't want to block a sync because logging failed, so we fail silently until we have a way to report error
            // TODO: find a way to report that
            return;
        }

        if (response.status > 299) {
            logger.error(`Request to persist API (log) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`, this.stringify());
            throw new Error(`Failed to log: ${JSON.stringify(response.data)}`);
        }
    }
}

export class NangoSync extends NangoAction {
    lastSyncDate?: Date;
    track_deletes = false;
    logMessages?: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } | undefined = {
        counts: { updated: 0, added: 0, deleted: 0 },
        messages: []
    };
    stubbedMetadata?: Metadata | undefined = undefined;

    private batchSize = 1000;

    constructor(config: NangoProps) {
        super(config);

        if (config.lastSyncDate) {
            this.lastSyncDate = config.lastSyncDate;
        }

        if (config.track_deletes) {
            this.track_deletes = config.track_deletes;
        }

        if (config.logMessages) {
            this.logMessages = config.logMessages;
        }

        if (config.stubbedMetadata) {
            this.stubbedMetadata = config.stubbedMetadata;
        }
        if (!config.dryRun) {
            if (!this.syncId) throw new Error('Parameter syncId is required when not in dryRun');
            if (!this.syncJobId) throw new Error('Parameter syncJobId is required when not in dryRun');
        }
    }

    /**
     * @deprecated please use batchSave
     */
    public async batchSend<T = any>(results: T[], model: string): Promise<boolean | null> {
        logger.warning('batchSend will be deprecated in future versions. Please use batchSave instead.');
        return this.batchSave(results, model);
    }

    public async batchSave<T = any>(results: T[], model: string): Promise<boolean | null> {
        this.exitSyncIfAborted();

        if (!results || results.length === 0) {
            if (this.dryRun) {
                logger.info('batchSave received an empty array. No records to save.');
            }
            return true;
        }

        // Validate records
        for (const record of results) {
            const validation = validateData({ input: record, jsonSchema: this.syncConfig!.models_json_schema, modelName: model });
            if (validation === true) {
                continue;
            }

            metrics.increment(metrics.Types.RUNNER_INVALID_SYNCS_RECORDS);

            await this.log('Invalid record payload', { data: record, validation, model }, { level: 'warn' });
            if (this.runnerFlags?.validateSyncRecords) {
                throw new NangoError(`invalid_sync_record`, { data: record, validation, model });
            }
        }

        if (this.dryRun) {
            this.logMessages?.messages.push(`A batch save call would save the following data to the ${model} model:`);
            for (const msg of results) {
                this.logMessages?.messages.push(msg);
            }
            if (this.logMessages && this.logMessages.counts) {
                this.logMessages.counts.added = Number(this.logMessages.counts.added) + results.length;
            }
            return null;
        }

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            let response: AxiosResponse;
            try {
                response = await retryWithBackoff(
                    () => {
                        return this.persistApi({
                            method: 'POST',
                            url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                            headers: {
                                Authorization: `Bearer ${this.nango.secretKey}`
                            },
                            data: {
                                model,
                                records: batch,
                                providerConfigKey: this.providerConfigKey,
                                connectionId: this.connectionId,
                                activityLogId: this.activityLogId
                            }
                        });
                    },
                    { retry: httpRetryStrategy }
                );
            } catch (err) {
                logger.error('Internal error', err instanceof AxiosError ? err.code : err);
                throw new Error('Failed to save records due to an internal error', { cause: err });
            }

            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchSave) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );

                if (response.status === 400) {
                    throw new Error(
                        `Records invalid format. Please make sure you are sending an array of objects that each contain an 'id' property with type string`
                    );
                } else {
                    throw new Error(`Failed to save records: ${JSON.stringify(response.data)}`);
                }
            }
        }
        return true;
    }

    public async batchDelete<T = any>(results: T[], model: string): Promise<boolean | null> {
        this.exitSyncIfAborted();
        if (!results || results.length === 0) {
            if (this.dryRun) {
                logger.info('batchDelete received an empty array. No records to delete.');
            }
            return true;
        }

        if (this.dryRun) {
            this.logMessages?.messages.push(`A batch delete call would delete the following data:`);
            for (const msg of results) {
                this.logMessages?.messages.push(msg);
            }
            if (this.logMessages && this.logMessages.counts) {
                this.logMessages.counts.deleted = Number(this.logMessages.counts.deleted) + results.length;
            }
            return null;
        }

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            let response: AxiosResponse;
            try {
                response = await retryWithBackoff(
                    async () => {
                        return await this.persistApi({
                            method: 'DELETE',
                            url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                            headers: {
                                Authorization: `Bearer ${this.nango.secretKey}`
                            },
                            data: {
                                model,
                                records: batch,
                                providerConfigKey: this.providerConfigKey,
                                connectionId: this.connectionId,
                                activityLogId: this.activityLogId
                            }
                        });
                    },
                    { retry: httpRetryStrategy }
                );
            } catch (err) {
                logger.error('Internal error', err instanceof AxiosError ? err.code : err);
                throw new Error('Failed to delete records due to an internal error', { cause: err });
            }

            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchDelete) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );
                throw new Error(`cannot delete records for sync '${this.syncId}': ${JSON.stringify(response.data)}`);
            }
        }
        return true;
    }

    public async batchUpdate<T = any>(results: T[], model: string): Promise<boolean | null> {
        this.exitSyncIfAborted();
        if (!results || results.length === 0) {
            if (this.dryRun) {
                logger.info('batchUpdate received an empty array. No records to update.');
            }
            return true;
        }

        if (this.dryRun) {
            this.logMessages?.messages.push(`A batch update call would update the following data to the ${model} model:`);
            for (const msg of results) {
                this.logMessages?.messages.push(msg);
            }
            if (this.logMessages && this.logMessages.counts) {
                this.logMessages.counts.updated = Number(this.logMessages.counts.updated) + results.length;
            }
            return null;
        }

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            let response: AxiosResponse;
            try {
                response = await retryWithBackoff(
                    async () => {
                        return await this.persistApi({
                            method: 'PUT',
                            url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                            headers: {
                                Authorization: `Bearer ${this.nango.secretKey}`
                            },
                            data: {
                                model,
                                records: batch,
                                providerConfigKey: this.providerConfigKey,
                                connectionId: this.connectionId,
                                activityLogId: this.activityLogId
                            }
                        });
                    },
                    { retry: httpRetryStrategy }
                );
            } catch (err) {
                logger.error('Internal error', err instanceof AxiosError ? err.code : err);
                throw new Error('Failed to update records due to an internal error', { cause: err });
            }

            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchUpdate) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );
                throw new Error(`cannot update records for sync '${this.syncId}': ${JSON.stringify(response.data)}`);
            }
        }
        return true;
    }

    public override async getMetadata<T = Metadata>(): Promise<T> {
        this.exitSyncIfAborted();
        if (this.dryRun && this.stubbedMetadata) {
            return this.stubbedMetadata as T;
        }

        return super.getMetadata<T>();
    }
}

const TELEMETRY_ALLOWED_METHODS: (keyof NangoSync)[] = [
    'batchDelete',
    'batchSave',
    'batchSend',
    'getConnection',
    'getEnvironmentVariables',
    'getMetadata',
    'proxy',
    'log',
    'triggerAction',
    'triggerSync'
];

/* eslint-disable no-inner-declarations */
/**
 * @internal
 *
 * This function will enable tracing on the SDK
 * It has been split from the actual code to avoid making the code too dirty and to easily enable/disable tracing if there is an issue with it
 */
export function instrumentSDK(rawNango: NangoAction | NangoSync) {
    return new Proxy(rawNango, {
        get<T extends typeof rawNango, K extends keyof typeof rawNango>(target: T, propKey: K) {
            // Method name is not matching the allowList we don't do anything else
            if (!TELEMETRY_ALLOWED_METHODS.includes(propKey)) {
                return target[propKey];
            }

            return metrics.time(`${metrics.Types.RUNNER_SDK}.${propKey}` as any, (target[propKey] as any).bind(target));
        }
    });
}

/* eslint-enable no-inner-declarations */
