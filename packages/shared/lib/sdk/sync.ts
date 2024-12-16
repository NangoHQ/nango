import https from 'node:https';
import { Nango, getUserAgent } from '@nangohq/node';
import type { AdminAxiosProps } from '@nangohq/node';
import paginateService from '../services/paginate.service.js';
import proxyService from '../services/proxy.service.js';
import type { AxiosInstance, AxiosInterceptorManager, AxiosRequestConfig, AxiosResponse } from 'axios';
import axios, { AxiosError } from 'axios';
import { getPersistAPIUrl } from '../utils/utils.js';
import type { UserProvidedProxyConfiguration } from '../models/Proxy.js';
import {
    getLogger,
    httpRetryStrategy,
    metrics,
    retryWithBackoff,
    MAX_LOG_PAYLOAD,
    stringifyAndTruncateValue,
    stringifyObject,
    truncateJson
} from '@nangohq/utils';
import type { SyncConfig } from '../models/Sync.js';
import type { ValidateDataError } from './dataValidation.js';
import { validateData } from './dataValidation.js';
import { NangoError } from '../utils/error.js';
import type { ApiEndUser, DBTeam, GetPublicIntegration, MessageRowInsert, RunnerFlags } from '@nangohq/types';
import { getProvider } from '../services/providers.js';
import { redactHeaders, redactURL } from '../utils/http.js';

const logger = getLogger('SDK');

export const oldLevelToNewLevel = {
    debug: 'debug',
    info: 'info',
    warn: 'warn',
    error: 'error',
    verbose: 'debug',
    silly: 'debug',
    http: 'info'
} as const;

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
    offset_start_value?: number;
    offset_calculation_method?: 'per-page' | 'by-response-size';
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
    Tableau: 'TABLEAU';
    Jwt: 'JWT';
    Bill: 'BILL';
    TwoStep: 'TWO_STEP';
    Signature: 'SIGNATURE';
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
interface TableauCredentials extends CredentialsCommon {
    type: AuthModes['Tableau'];
    pat_name: string;
    pat_secret: string;
    content_url?: string;
    token?: string;
    expires_at?: Date | undefined;
}
interface JwtCredentials {
    type: AuthModes['Jwt'];
    privateKeyId?: string;
    issuerId?: string;
    privateKey:
        | {
              id: string;
              secret: string;
          }
        | string; // Colon-separated string for Ghost Admin: 'id:secret'
    token?: string;
    expires_at?: Date | undefined;
}
interface BillCredentials extends CredentialsCommon {
    type: AuthModes['Bill'];
    username: string;
    password: string;
    organization_id: string;
    dev_key: string;
    session_id?: string;
    user_id?: string;
    expires_at?: Date | undefined;
}
interface TwoStepCredentials extends CredentialsCommon {
    type: AuthModes['TwoStep'];
    [key: string]: any;
    token?: string;
    expires_at?: Date | undefined;
}
interface SignatureCredentials {
    type: AuthModes['Signature'];
    username: string;
    password: string;
    token?: string;
    expires_at?: Date | undefined;
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
    | TableauCredentials
    | JwtCredentials
    | BillCredentials
    | TwoStepCredentials
    | SignatureCredentials
    | CustomCredentials;

type Metadata = Record<string, unknown>;

interface MetadataChangeResponse {
    metadata: Metadata;
    provider_config_key: string;
    connection_id: string | string[];
}

interface Connection {
    id: number;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    created_at: string;
    updated_at: string;
    last_fetched_at: string;
    metadata: Record<string, unknown> | null;
    provider: string;
    errors: { type: string; log_id: string }[];
    end_user: ApiEndUser | null;
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
    scriptType: 'sync' | 'action' | 'webhook' | 'on-event';
    host?: string;
    secretKey: string;
    team?: Pick<DBTeam, 'id' | 'name'>;
    connectionId: string;
    environmentId: number;
    environmentName?: string;
    activityLogId?: string | undefined;
    providerConfigKey: string;
    provider: string;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    nangoConnectionId?: number;
    syncJobId?: number | undefined;
    dryRun?: boolean;
    track_deletes?: boolean;
    attributes?: object | undefined;
    logMessages?: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } | undefined;
    rawSaveOutput?: Map<string, unknown[]> | undefined;
    rawDeleteOutput?: Map<string, unknown[]> | undefined;
    stubbedMetadata?: Metadata | undefined;
    abortSignal?: AbortSignal;
    dryRunService?: DryRunServiceInterface;
    syncConfig: SyncConfig;
    runnerFlags: RunnerFlags;
    debug: boolean;
    startedAt: Date;
    endUser: { id: number; endUserId: string | null; orgId: string | null } | null;

    axios?: {
        request?: AxiosInterceptorManager<AxiosRequestConfig>;
        response?: {
            onFulfilled: (value: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
            onRejected: (value: unknown) => AxiosError | Promise<AxiosError>;
        };
    };
}

export interface EnvironmentVariable {
    name: string;
    value: string;
}

const MEMOIZED_CONNECTION_TTL = 60000;
const MEMOIZED_INTEGRATION_TTL = 10 * 60 * 1000;
const RECORDS_VALIDATION_SAMPLE = 5;

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
    activityLogId?: string | undefined;
    syncId?: string;
    nangoConnectionId?: number;
    environmentId: number;
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

    private memoizedConnections = new Map<string, { connection: Connection; timestamp: number }>();
    private memoizedIntegration = new Map<string, { integration: GetPublicIntegration['Success']['data']; timestamp: number }>();

    constructor(config: NangoProps, { persistApi }: { persistApi: AxiosInstance } = { persistApi: defaultPersistApi }) {
        this.connectionId = config.connectionId;
        this.environmentId = config.environmentId;
        this.providerConfigKey = config.providerConfigKey;
        this.persistApi = persistApi;
        this.runnerFlags = config.runnerFlags;

        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }

        const axiosSettings: AdminAxiosProps = {
            userAgent: 'sdk'
        };

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

            if (config.axios?.response) {
                axiosSettings.interceptors = {
                    response: {
                        onFulfilled: config.axios.response.onFulfilled,
                        onRejected: config.axios.response.onRejected
                    }
                };
            }
        }
        if (!config.axios?.response) {
            // Leave the priority to saving response instead of logging
            axiosSettings.interceptors = {
                response: {
                    onFulfilled: this.logAPICall.bind(this)
                }
            };
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

        this.nango = new Nango({ isSync: true, ...config }, axiosSettings);

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
            method: 'GET',
            ...config,
            providerConfigKey: config.providerConfigKey,
            connectionId: config.connectionId,
            headers: {
                ...(config.headers || {}),
                'user-agent': this.nango.userAgent
            }
        };
    }

    protected throwIfAborted(): void {
        if (this.abortSignal?.aborted) {
            throw new NangoError('script_aborted');
        }
    }

    public async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        this.throwIfAborted();
        if (!config.method) {
            config.method = 'GET';
        }

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
                providerName: this.provider as string
            });

            // We batch save, since we have buffered the createdAt it shouldn't impact order
            await Promise.all(
                logs.map(async (log) => {
                    if (log.level === 'debug') {
                        return;
                    }
                    await this.sendLogToPersist(log);
                })
            );

            if (response instanceof Error) {
                throw response;
            }

            return response;
        }
    }

    public async get<T = any>(config: Omit<ProxyConfiguration, 'method'>): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'GET'
        });
    }

    public async post<T = any>(config: Omit<ProxyConfiguration, 'method'>): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'POST'
        });
    }

    public async put<T = any>(config: Omit<ProxyConfiguration, 'method'>): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'PUT'
        });
    }

    public async patch<T = any>(config: Omit<ProxyConfiguration, 'method'>): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'PATCH'
        });
    }

    public async delete<T = any>(config: Omit<ProxyConfiguration, 'method'>): Promise<AxiosResponse<T>> {
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
        | TableauCredentials
        | JwtCredentials
        | BillCredentials
        | TwoStepCredentials
        | SignatureCredentials
    > {
        this.throwIfAborted();
        return this.nango.getToken(this.providerConfigKey, this.connectionId);
    }

    /**
     * Get current integration
     */
    public async getIntegration(queries?: GetPublicIntegration['Querystring']): Promise<GetPublicIntegration['Success']['data']> {
        this.throwIfAborted();

        const key = queries?.include?.join(',') || 'default';
        const has = this.memoizedIntegration.get(key);
        if (has && MEMOIZED_INTEGRATION_TTL > Date.now() - has.timestamp) {
            return has.integration;
        }

        const { data: integration } = await this.nango.getIntegration({ uniqueKey: this.providerConfigKey }, queries);
        this.memoizedIntegration.set(key, { integration, timestamp: Date.now() });
        return integration;
    }

    public async getConnection(providerConfigKeyOverride?: string, connectionIdOverride?: string): Promise<Connection> {
        this.throwIfAborted();

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
        this.throwIfAborted();
        try {
            return await this.nango.setMetadata(this.providerConfigKey, this.connectionId, metadata);
        } finally {
            this.memoizedConnections.delete(`${this.providerConfigKey}${this.connectionId}`);
        }
    }

    public async updateMetadata(metadata: Metadata): Promise<AxiosResponse<MetadataChangeResponse>> {
        this.throwIfAborted();
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
        this.throwIfAborted();
        return (await this.getConnection(this.providerConfigKey, this.connectionId)).metadata as T;
    }

    public async getWebhookURL(): Promise<string | null | undefined> {
        this.throwIfAborted();
        const integration = await this.getIntegration({ include: ['webhook'] });
        return integration.webhook_url;
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
        this.throwIfAborted();
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
            const logLevel = logLevelToLogger[level] ?? 'info';

            // TODO: we shouldn't use a floating logger, it should be passed from dryrun or runner
            if (args.length > 1 && 'type' in args[1] && args[1].type === 'http') {
                logger[logLevel].apply(null, [args[0], { status: args[1]?.response?.code || 'xxx' }] as any);
            } else {
                logger[logLevel].apply(null, args as any);
            }

            return;
        }

        const [message, payload] = args;

        // arrays are not supported in the log meta, so we convert them to objects
        const meta = Array.isArray(payload) ? Object.fromEntries(payload.map((e, i) => [i, e])) : payload || null;

        await this.sendLogToPersist({
            type: 'log',
            level: oldLevelToNewLevel[level],
            source: 'user',
            message: stringifyAndTruncateValue(message),
            meta,
            createdAt: new Date().toISOString(),
            environmentId: this.environmentId
        });
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
        const provider = getProvider(this.provider as string);
        if (!provider) {
            throw new NangoError('unknown_provider_template_in_config');
        }

        const templatePaginationConfig = provider.proxy?.paginate;

        if (!templatePaginationConfig && (!config.paginate || !config.paginate.type)) {
            throw Error('There was no pagination configuration for this integration or configuration passed in.');
        }

        const paginationConfig = {
            ...(templatePaginationConfig || {}),
            ...(config.paginate || {})
        } as Pagination;

        paginateService.validateConfiguration(paginationConfig);

        config.method = config.method || 'GET';

        const configMethod = config.method.toLocaleLowerCase();
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

    public async triggerAction<In = unknown, Out = object>(providerConfigKey: string, connectionId: string, actionName: string, input?: In): Promise<Out> {
        return await this.nango.triggerAction(providerConfigKey, connectionId, actionName, input);
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

    private async sendLogToPersist(log: MessageRowInsert) {
        let response: AxiosResponse;
        try {
            response = await retryWithBackoff(
                async () => {
                    let data = stringifyObject({ activityLogId: this.activityLogId, log });

                    // We try to keep log object under an acceptable size, before reaching network
                    // The idea is to always log something instead of silently crashing without overloading persist
                    if (data.length > MAX_LOG_PAYLOAD) {
                        log.message += ` ... (truncated, payload was too large)`;
                        // Truncating can remove mandatory field so we only try to truncate meta
                        if (log.meta) {
                            data = stringifyObject({
                                activityLogId: this.activityLogId,
                                log: { ...log, meta: truncateJson(log.meta) as MessageRowInsert['meta'] }
                            });
                        }
                    }

                    return await this.persistApi({
                        method: 'POST',
                        url: `/environment/${this.environmentId}/log`,
                        headers: {
                            Authorization: `Bearer ${this.nango.secretKey}`,
                            'Content-Type': 'application/json'
                        },
                        data
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
            logger.error(
                `Request to persist API (log) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}' log=${JSON.stringify(log)}`,
                this.stringify()
            );
            throw new Error(`Failed to log: ${JSON.stringify(response.data)}`);
        }
    }

    private logAPICall(res: AxiosResponse): AxiosResponse {
        if (!res.config.url) {
            return res;
        }

        // We compte on the fly because connection's credentials can change during a single run
        // We could further optimize this and cache it when the memoizedConnection is updated
        const valuesToFilter: string[] = [
            ...Array.from(this.memoizedConnections.values()).reduce<string[]>((acc, conn) => {
                if (!conn) {
                    return acc;
                }
                acc.push(...Object.values(conn.connection.credentials));
                return acc;
            }, []),
            this.nango.secretKey
        ];

        const method = res.config.method?.toLocaleUpperCase(); // axios put it in lowercase;
        void this.log(
            `${method} ${res.config.url}`,
            {
                type: 'http',
                request: {
                    method: method,
                    url: redactURL({ url: res.config.url, valuesToFilter }),
                    headers: redactHeaders({ headers: res.config.headers, valuesToFilter })
                },
                response: {
                    code: res.status,
                    headers: redactHeaders({ headers: res.headers, valuesToFilter })
                }
            },
            { level: res.status > 299 ? 'error' : 'info' }
        );
        return res;
    }
}

export class NangoSync extends NangoAction {
    lastSyncDate?: Date;
    track_deletes = false;
    logMessages?: { counts: { updated: number; added: number; deleted: number }; messages: unknown[] } | undefined = {
        counts: { updated: 0, added: 0, deleted: 0 },
        messages: []
    };
    rawSaveOutput?: Map<string, unknown[]>;
    rawDeleteOutput?: Map<string, unknown[]>;
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

        if (config.rawSaveOutput) {
            this.rawSaveOutput = config.rawSaveOutput;
        }

        if (config.rawDeleteOutput) {
            this.rawDeleteOutput = config.rawDeleteOutput;
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
        this.throwIfAborted();

        if (!results || results.length === 0) {
            if (this.dryRun) {
                logger.info('batchSave received an empty array. No records to save.');
            }
            return true;
        }

        // Validate records
        const hasErrors: { data: any; validation: ValidateDataError[] }[] = [];
        for (const record of results) {
            const validation = validateData({
                version: this.syncConfig?.version || '1',
                input: JSON.parse(JSON.stringify(record)),
                jsonSchema: this.syncConfig!.models_json_schema,
                modelName: model
            });
            if (validation === true) {
                continue;
            }

            hasErrors.push({ data: record, validation });
            metrics.increment(metrics.Types.RUNNER_INVALID_SYNCS_RECORDS);

            if (this.runnerFlags?.validateSyncRecords) {
                break;
            }
        }
        if (hasErrors.length > 0) {
            if (this.dryRun) {
                await this.log('Invalid record payload. Use `--validation` option to see the details', { level: 'warn' });
            }
            if (this.runnerFlags?.validateSyncRecords) {
                throw new NangoError(`invalid_sync_record`, { ...hasErrors[0], model });
            }

            const sampled = hasErrors.length > RECORDS_VALIDATION_SAMPLE;
            const sample = sampled ? hasErrors.slice(0, RECORDS_VALIDATION_SAMPLE) : hasErrors;
            if (sampled) {
                await this.log(`Invalid records: ${hasErrors.length} failed ${sampled ? `(sampled to ${RECORDS_VALIDATION_SAMPLE})` : ''}`, { level: 'warn' });
            }
            await Promise.all(
                sample.map((log) => {
                    return this.log(`Invalid record payload`, { ...log, model }, { level: 'warn' });
                })
            );
        }

        if (this.dryRun) {
            this.logMessages?.messages.push(`A batch save call would save the following data to the ${model} model:`);
            for (const msg of results) {
                this.logMessages?.messages.push(msg);
            }
            if (this.logMessages && this.logMessages.counts) {
                this.logMessages.counts.added = Number(this.logMessages.counts.added) + results.length;
            }
            if (this.rawSaveOutput) {
                if (!this.rawSaveOutput.has(model)) {
                    this.rawSaveOutput.set(model, []);
                }
                this.rawSaveOutput.get(model)?.push(...results);
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
                    const message = 'error' in response.data && 'message' in response.data.error ? response.data.error.message : JSON.stringify(response.data);
                    throw new Error(message);
                }
            }
        }
        return true;
    }

    public async batchDelete<T = any>(results: T[], model: string): Promise<boolean | null> {
        this.throwIfAborted();
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
            if (this.rawDeleteOutput) {
                if (!this.rawDeleteOutput.has(model)) {
                    this.rawDeleteOutput.set(model, []);
                }
                this.rawDeleteOutput.get(model)?.push(...results);
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
                const message = 'error' in response.data && 'message' in response.data.error ? response.data.error.message : JSON.stringify(response.data);
                throw new Error(message);
            }
        }
        return true;
    }

    public async batchUpdate<T = any>(results: T[], model: string): Promise<boolean | null> {
        this.throwIfAborted();
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
                const message = 'error' in response.data && 'message' in response.data.error ? response.data.error.message : JSON.stringify(response.data);
                throw new Error(message);
            }
        }
        return true;
    }

    public override async getMetadata<T = Metadata>(): Promise<T> {
        this.throwIfAborted();
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
