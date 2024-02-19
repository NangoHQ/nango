import { Nango } from '@nangohq/node';
import configService from '../services/config.service.js';
import paginateService from '../services/paginate.service.js';
import proxyService from '../services/proxy.service.js';
import axios from 'axios';
import { getPersistAPIUrl, safeStringify } from '../utils/utils.js';
import type { IntegrationWithCreds } from '@nangohq/node/lib/types.js';
import type { UserProvidedProxyConfiguration } from '../models/Proxy.js';
import logger from '../logger/console.js';
import telemetry, { MetricTypes } from '../utils/telemetry.js';

/*
 *
 * NOTICE!!
 * This file is imported from the cli so any type needs to be explicitly
 * specified in this file because imports won't resolve when copying
 * over this file to the cli
 *
 */
type LogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';

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
}

enum AuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    Basic = 'BASIC',
    ApiKey = 'API_KEY',
    AppStore = 'APP_STORE',
    App = 'APP',
    Custom = 'CUSTOM',
    None = 'NONE'
}

interface OAuth1Token {
    oAuthToken: string;
    oAuthTokenSecret: string;
}

interface AppCredentials extends CredentialsCommon {
    type: AuthModes.App;
    access_token: string;
    expires_at?: Date | undefined;
    raw: Record<string, any>;
}

interface BasicApiCredentials extends CredentialsCommon {
    type: AuthModes.Basic;
    username: string;
    password: string;
}

interface ApiKeyCredentials extends CredentialsCommon {
    type: AuthModes.ApiKey;
    apiKey: string;
}

interface CredentialsCommon<T = Record<string, any>> {
    type: AuthModes;
    raw: T;
}

interface OAuth2Credentials extends CredentialsCommon {
    type: AuthModes.OAuth2;
    access_token: string;

    refresh_token?: string;
    expires_at?: Date | undefined;
}

interface OAuth1Credentials extends CredentialsCommon {
    type: AuthModes.OAuth1;
    oauth_token: string;
    oauth_token_secret: string;
}

type AuthCredentials = OAuth2Credentials | OAuth1Credentials | BasicApiCredentials | ApiKeyCredentials | AppCredentials;

type Metadata = Record<string, string | Record<string, any>>;

interface Connection {
    id?: number;
    created_at?: Date;
    updated_at?: Date;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata: Metadata | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: AuthCredentials;
}

export class ActionError extends Error {
    type: string;
    payload?: Record<string, unknown>;

    constructor(payload?: Record<string, unknown>) {
        super();
        this.type = 'action_script_runtime_error';
        if (payload) {
            this.payload = payload;
        }
    }
}

export interface NangoProps {
    host?: string;
    secretKey: string;
    accountId?: number;
    connectionId?: string;
    environmentId?: number;
    activityLogId?: number;
    providerConfigKey?: string;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    nangoConnectionId?: number;
    syncJobId?: number | undefined;
    dryRun?: boolean;
    track_deletes?: boolean;
    attributes?: object | undefined;
    logMessages?: unknown[] | undefined;
    stubbedMetadata?: Metadata | undefined;
    abortSignal?: AbortSignal;
}

interface EnvironmentVariable {
    name: string;
    value: string;
}

export class NangoAction {
    private nango: Nango;
    private attributes = {};
    activityLogId?: number;
    syncId?: string;
    nangoConnectionId?: number;
    environmentId?: number;
    syncJobId?: number;
    dryRun?: boolean;
    abortSignal?: AbortSignal;

    public connectionId?: string;
    public providerConfigKey?: string;

    public ActionError = ActionError;

    constructor(config: NangoProps) {
        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }

        this.nango = new Nango({
            isSync: true,
            ...config
        });

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

        if (config.connectionId) {
            this.connectionId = config.connectionId;
        }

        if (config.providerConfigKey) {
            this.providerConfigKey = config.providerConfigKey;
        }

        if (config.environmentId) {
            this.environmentId = config.environmentId;
        }

        if (config.attributes) {
            this.attributes = config.attributes;
        }

        if (config.abortSignal) {
            this.abortSignal = config.abortSignal;
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
            connectionId: config.connectionId
        };
    }

    protected async exitSyncIfAborted(): Promise<void> {
        if (this.abortSignal?.aborted) {
            process.exit(0);
        }
    }

    public async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        this.exitSyncIfAborted();
        if (this.dryRun) {
            return this.nango.proxy(config);
        } else {
            const proxyConfig = this.proxyConfig(config);
            const connection = await this.nango.getConnection(proxyConfig.providerConfigKey, proxyConfig.connectionId);
            if (!connection) {
                throw new Error(`Connection not found using the provider config key ${this.providerConfigKey} and connection id ${this.connectionId}`);
            }
            const {
                config: { provider }
            } = await this.nango.getIntegration(proxyConfig.providerConfigKey);

            const { response, activityLogs: activityLogs } = await proxyService.route(proxyConfig, {
                existingActivityLogId: this.activityLogId as number,
                connection: connection,
                provider
            });

            if (activityLogs) {
                for (const log of activityLogs) {
                    if (log.level === 'debug') continue;
                    await this.log(log.content, { level: log.level });
                    switch (log.level) {
                        case 'error':
                            logger.error(log.content);
                            break;
                        case 'warn':
                            logger.warn(log.content);
                            break;
                        case 'info':
                            logger.info(log.content);
                            break;
                        default:
                            logger.debug(log.content);
                    }
                }
            }

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

    public async getToken(): Promise<string | OAuth1Token | BasicApiCredentials | ApiKeyCredentials | AppCredentials> {
        this.exitSyncIfAborted();
        return this.nango.getToken(this.providerConfigKey as string, this.connectionId as string);
    }

    public async getConnection(): Promise<Connection> {
        this.exitSyncIfAborted();
        return this.nango.getConnection(this.providerConfigKey as string, this.connectionId as string);
    }

    public async setMetadata(metadata: Record<string, any>): Promise<AxiosResponse<void>> {
        this.exitSyncIfAborted();
        return this.nango.setMetadata(this.providerConfigKey as string, this.connectionId as string, metadata);
    }

    public async updateMetadata(metadata: Record<string, any>): Promise<AxiosResponse<void>> {
        this.exitSyncIfAborted();
        return this.nango.updateMetadata(this.providerConfigKey as string, this.connectionId as string, metadata);
    }

    public async setFieldMapping(fieldMapping: Record<string, string>): Promise<AxiosResponse<void>> {
        logger.warn('setFieldMapping is deprecated. Please use setMetadata instead.');
        return this.nango.setMetadata(this.providerConfigKey as string, this.connectionId as string, fieldMapping);
    }

    public async getMetadata<T = Metadata>(): Promise<T> {
        this.exitSyncIfAborted();
        return this.nango.getMetadata(this.providerConfigKey as string, this.connectionId as string);
    }

    public async getWebhookURL(): Promise<string | undefined> {
        this.exitSyncIfAborted();
        const { config: integration } = await this.nango.getIntegration(this.providerConfigKey!, true);
        if (!integration || !integration.provider) {
            throw Error(`There was no provider found for the provider config key: ${this.providerConfigKey}`);
        }
        return (integration as IntegrationWithCreds).webhook_url;
    }

    public async getFieldMapping(): Promise<Metadata> {
        logger.warn('getFieldMapping is deprecated. Please use getMetadata instead.');
        const metadata = await this.nango.getMetadata(this.providerConfigKey as string, this.connectionId as string);
        return (metadata['fieldMapping'] as Metadata) || {};
    }

    /**
     * Log
     * @desc Log a message to the activity log which shows up in the Nango Dashboard
     * note that the last argument can be an object with a level property to specify the log level
     * example: await nango.log('This is a log message', { level: 'error' })
     * error = red
     * warn = orange
     * info = white
     * debug = grey
     * http = green
     * silly = light green
     */
    public async log(...args: any[]): Promise<void> {
        this.exitSyncIfAborted();
        if (args.length === 0) {
            return;
        }

        const lastArg = args[args.length - 1];

        const isUserDefinedLevel = (object: UserLogParameters | any): boolean => {
            return typeof lastArg === 'object' && 'level' in object;
        };

        const userDefinedLevel: UserLogParameters | undefined = isUserDefinedLevel(lastArg) ? lastArg : undefined;

        if (userDefinedLevel) {
            args.pop();
        }

        const content = safeStringify(args);

        if (this.dryRun) {
            logger.info([...args]);
            return;
        }

        if (!this.activityLogId) {
            throw new Error('There is no current activity log stream to log to');
        }

        const response = await persistApi({
            method: 'POST',
            url: `/environment/${this.environmentId}/log`,
            data: {
                activityLogId: this.activityLogId,
                level: userDefinedLevel?.level ?? 'info',
                msg: content
            }
        });

        if (response.status > 299) {
            logger.error(`Request to persist API (log) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`, this.stringify());
            throw new Error(`Cannot save log for activityLogId '${this.activityLogId}'`);
        }

        return;
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
        const providerConfigKey: string = this.providerConfigKey as string;
        const response = await this.nango.getIntegration(providerConfigKey);

        if (!response || !response.config || !response.config.provider) {
            throw Error(`There was no provider found for the provider config key: ${providerConfigKey}`);
        }

        const template = configService.getTemplate(response.config.provider);
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

    public async triggerAction(providerConfigKey: string, connectionId: string, actionName: string, input?: unknown): Promise<object> {
        return this.nango.triggerAction(providerConfigKey, connectionId, actionName, input);
    }
}

export class NangoSync extends NangoAction {
    lastSyncDate?: Date;
    track_deletes = false;
    logMessages?: unknown[] | undefined = [];
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
    }

    /**
     * Deprecated, reach out to support
     */
    public async setLastSyncDate(): Promise<void> {
        logger.warn('setLastSyncDate is deprecated. Please contact us if you are using this method.');
    }

    /**
     * Deprecated, please use batchSave
     */
    public async batchSend<T = any>(results: T[], model: string): Promise<boolean | null> {
        logger.warn('batchSend will be deprecated in future versions. Please use batchSave instead.');
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

        if (!this.environmentId || !this.nangoConnectionId || !this.syncId || !this.activityLogId || !this.syncJobId) {
            throw new Error('Nango environment Id, Connection Id, Sync Id, Activity Log Id and Sync Job Id are all required');
        }

        if (this.dryRun) {
            this.logMessages?.push(`A batch save call would save the following data to the ${model} model:`);
            this.logMessages?.push(...results);
            return null;
        }

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            const response = await persistApi({
                method: 'POST',
                url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                data: {
                    model,
                    records: batch,
                    providerConfigKey: this.providerConfigKey,
                    connectionId: this.connectionId,
                    activityLogId: this.activityLogId,
                    lastSyncDate: this.lastSyncDate || new Date(),
                    trackDeletes: this.track_deletes
                }
            });
            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchSave) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );
                throw new Error(`cannot save records for sync '${this.syncId}'`);
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

        if (!this.environmentId || !this.nangoConnectionId || !this.syncId || !this.activityLogId || !this.syncJobId) {
            throw new Error('Nango environment Id, Connection Id, Sync Id, Activity Log Id and Sync Job Id are all required');
        }

        if (this.dryRun) {
            this.logMessages?.push(`A batch delete call would delete the following data:`);
            this.logMessages?.push(...results);
            return null;
        }

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            const response = await persistApi({
                method: 'DELETE',
                url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                data: {
                    model,
                    records: batch,
                    providerConfigKey: this.providerConfigKey,
                    connectionId: this.connectionId,
                    activityLogId: this.activityLogId,
                    lastSyncDate: this.lastSyncDate || new Date(),
                    trackDeletes: this.track_deletes
                }
            });
            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchDelete) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );
                throw new Error(`cannot delete records for sync '${this.syncId}'`);
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

        if (!this.environmentId || !this.nangoConnectionId || !this.syncId || !this.activityLogId || !this.syncJobId) {
            throw new Error('Nango environment Id, Connection Id, Sync Id, Activity Log Id and Sync Job Id are all required');
        }

        if (this.dryRun) {
            this.logMessages?.push(`A batch update call would update the following data to the ${model} model:`);
            this.logMessages?.push(...results);
            return null;
        }

        for (let i = 0; i < results.length; i += this.batchSize) {
            const batch = results.slice(i, i + this.batchSize);
            const response = await persistApi({
                method: 'PUT',
                url: `/environment/${this.environmentId}/connection/${this.nangoConnectionId}/sync/${this.syncId}/job/${this.syncJobId}/records`,
                data: {
                    model,
                    records: batch,
                    providerConfigKey: this.providerConfigKey,
                    connectionId: this.connectionId,
                    activityLogId: this.activityLogId,
                    lastSyncDate: this.lastSyncDate || new Date(),
                    trackDeletes: this.track_deletes
                }
            });
            if (response.status > 299) {
                logger.error(
                    `Request to persist API (batchUpdate) failed: errorCode=${response.status} response='${JSON.stringify(response.data)}'`,
                    this.stringify()
                );
                throw new Error(`cannot update records for sync '${this.syncId}'`);
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

const persistApi = axios.create({
    baseURL: getPersistAPIUrl(),
    validateStatus: (_status) => {
        return true;
    }
});

const TELEMETRY_ALLOWED_METHODS: (keyof NangoSync)[] = [
    'batchDelete',
    'batchSave',
    'batchSend',
    'getConnection',
    'getEnvironmentVariables',
    'getMetadata',
    'proxy',
    'log'
];

/* eslint-disable no-inner-declarations */
/**
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

            return telemetry.time(`${MetricTypes.RUNNER_SDK}.${propKey}` as any, (target[propKey] as any).bind(target));
        }
    });
}

/* eslint-enable no-inner-declarations */
