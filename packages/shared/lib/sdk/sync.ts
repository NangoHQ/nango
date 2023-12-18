import { getSyncConfigByJobId } from '../services/sync/config/config.service.js';
import { updateRecord, upsert } from '../services/sync/data/data.service.js';
import { formatDataRecords } from '../services/sync/data/records.service.js';
import { createActivityLogMessage } from '../services/activity/activity.service.js';
import { setLastSyncDate } from '../services/sync/sync.service.js';
import { updateSyncJobResult } from '../services/sync/job.service.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { LogActionEnum } from '../models/Activity.js';

import { Nango } from '@nangohq/node';
import configService from '../services/config.service.js';
import paginateService from '../services/paginate.service.js';
import proxyService from '../services/proxy.service.js';

type LogLevel = 'info' | 'debug' | 'error' | 'warn' | 'http' | 'verbose' | 'silly';

interface ParamEncoder {
    (value: any, defaultEncoder: (value: any) => any): any;
}

interface GenericFormData {
    append(name: string, value: any, options?: any): any;
}

interface SerializerVisitor {
    (this: GenericFormData, value: any, key: string | number, path: null | Array<string | number>, helpers: FormDataVisitorHelpers): boolean;
}

interface CustomParamsSerializer {
    (params: Record<string, any>, options?: ParamsSerializerOptions): string;
}

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

interface DataResponse {
    id?: string;
    [index: string]: unknown | undefined | string | number | boolean | Record<string, string | boolean | number | unknown>;
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
    responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
}

enum AuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    Basic = 'BASIC',
    ApiKey = 'API_KEY',
    App = 'APP'
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

interface Metadata {
    [key: string]: string | Record<string, any>;
}

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
}

interface UserLogParameters {
    level?: LogLevel;
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

    public connectionId?: string;
    public providerConfigKey?: string;

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
    }

    public async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        const internalConfig = {
            environmentId: this.environmentId as number,
            isFlow: true,
            isDryRun: this.dryRun as boolean,
            existingActivityLogId: this.activityLogId as number,
            throwErrors: true
        };

        let connection = undefined;

        if (!config.connectionId && this.connectionId) {
            config.connectionId = this.connectionId;
        }

        if (!config.providerConfigKey && this.providerConfigKey) {
            config.providerConfigKey = this.providerConfigKey;
        }

        if (this.dryRun) {
            return this.nango.proxy(config);
        } else {
            const { connectionId, providerConfigKey } = config;
            connection = await this.nango.getConnection(providerConfigKey as string, connectionId as string);

            if (!connection) {
                throw new Error(`Connection not found using the provider config key ${this.providerConfigKey} and connection id ${this.connectionId}`);
            }

            return proxyService.routeOrConfigure(config, { ...internalConfig, connection: connection as Connection }) as Promise<AxiosResponse<T>>;
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

    public async getConnection(): Promise<Connection> {
        return this.nango.getConnection(this.providerConfigKey as string, this.connectionId as string);
    }

    public async setMetadata(metadata: Record<string, any>): Promise<AxiosResponse<void>> {
        return this.nango.setMetadata(this.providerConfigKey as string, this.connectionId as string, metadata);
    }

    public async updateMetadata(metadata: Record<string, string>): Promise<AxiosResponse<void>> {
        return this.nango.updateMetadata(this.providerConfigKey as string, this.connectionId as string, metadata);
    }

    public async setFieldMapping(fieldMapping: Record<string, string>): Promise<AxiosResponse<void>> {
        console.warn('setFieldMapping is deprecated. Please use setMetadata instead.');
        return this.nango.setMetadata(this.providerConfigKey as string, this.connectionId as string, fieldMapping);
    }

    public async getMetadata<T = Metadata>(): Promise<T> {
        return this.nango.getMetadata(this.providerConfigKey as string, this.connectionId as string);
    }

    public async getFieldMapping(): Promise<Metadata> {
        console.warn('getFieldMapping is deprecated. Please use getMetadata instead.');
        const metadata = await this.nango.getMetadata(this.providerConfigKey as string, this.connectionId as string);
        return (metadata['fieldMapping'] as Metadata) || {};
    }

    public async log(content: string, userDefinedLevel?: UserLogParameters): Promise<void> {
        if (this.dryRun) {
            console.log(content);
            return;
        }

        if (!this.activityLogId) {
            throw new Error('There is no current activity log stream to log to');
        }

        await createActivityLogMessage(
            {
                level: userDefinedLevel?.level ?? 'info',
                environment_id: this.environmentId as number,
                activity_log_id: this.activityLogId as number,
                content,
                timestamp: Date.now()
            },
            false
        );
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

        switch (paginationConfig.type.toLowerCase()) {
            case PaginationType.CURSOR:
                return yield* paginateService.cursor<T>(
                    config,
                    paginationConfig as CursorPagination,
                    updatedBodyOrParams,
                    passPaginationParamsInBody,
                    this.proxy.bind(this)
                );
            case PaginationType.LINK:
                return yield* paginateService.link<T>(config, paginationConfig, updatedBodyOrParams, passPaginationParamsInBody, this.proxy.bind(this));
            case PaginationType.OFFSET:
                return yield* paginateService.offset<T>(
                    config,
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
     * Set Sync Last Sync Date
     * @desc permanently set the last sync date for the sync
     * to be used for the next sync run
     */
    public async setLastSyncDate(date: Date): Promise<boolean> {
        if (date.toString() === 'Invalid Date') {
            throw new Error('Invalid Date');
        }
        const result = await setLastSyncDate(this.syncId as string, date);

        return result;
    }

    /**
     * Deprecated, please use batchSave
     */
    public async batchSend<T = any>(results: T[], model: string): Promise<boolean | null> {
        console.warn('batchSend will be deprecated in future versions. Please use batchSave instead.');
        return this.batchSave(results, model);
    }

    public async batchSave<T = any>(results: T[], model: string): Promise<boolean | null> {
        if (!results || results.length === 0) {
            if (this.dryRun) {
                console.log('batchSave received an empty array. No records to save.');
            }
            return true;
        }

        if (!this.nangoConnectionId || !this.syncId || !this.activityLogId || !this.syncJobId) {
            throw new Error('Nango Connection Id, Sync Id, Activity Log Id and Sync Job Id are all required');
        }

        const {
            success,
            error,
            response: formattedResults
        } = formatDataRecords(
            results as unknown as DataResponse[],
            this.nangoConnectionId as number,
            model,
            this.syncId as string,
            this.syncJobId,
            this.lastSyncDate,
            this.track_deletes
        );

        if (!success || formattedResults === null) {
            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: this.environmentId as number,
                    activity_log_id: this.activityLogId as number,
                    content: `There was an issue with the batch save. ${error?.message}`,
                    timestamp: Date.now()
                });
            }

            throw error;
        }

        if (this.dryRun) {
            this.logMessages?.push(`A batch save call would save the following data to the ${model} model:`);
            this.logMessages?.push(...results);
            return null;
        }

        const syncConfig = await getSyncConfigByJobId(this.syncJobId as number);

        if (syncConfig && !syncConfig?.models.includes(model)) {
            throw new Error(`The model: ${model} is not included in the declared sync models: ${syncConfig.models}.`);
        }

        const responseResults = await upsert(
            formattedResults,
            '_nango_sync_data_records',
            'external_id',
            this.nangoConnectionId as number,
            model,
            this.activityLogId as number,
            this.environmentId as number,
            this.track_deletes
        );

        if (responseResults.success) {
            const { summary } = responseResults;
            const updatedResults = {
                [model]: {
                    added: summary?.addedKeys.length as number,
                    updated: summary?.updatedKeys.length as number,
                    deleted: summary?.deletedKeys?.length as number
                }
            };

            await createActivityLogMessage({
                level: 'info',
                environment_id: this.environmentId as number,
                activity_log_id: this.activityLogId as number,
                content: `Batch save was a success and resulted in ${JSON.stringify(updatedResults, null, 2)}`,
                timestamp: Date.now()
            });

            await updateSyncJobResult(this.syncJobId as number, updatedResults, model);

            return true;
        } else {
            const content = `There was an issue with the batch save. ${responseResults?.error}`;

            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: this.environmentId as number,
                    activity_log_id: this.activityLogId as number,
                    content,
                    timestamp: Date.now()
                });

                await errorManager.report(content, {
                    environmentId: this.environmentId as number,
                    source: ErrorSourceEnum.CUSTOMER,
                    operation: LogActionEnum.SYNC,
                    metadata: {
                        connectionId: this.connectionId,
                        providerConfigKey: this.providerConfigKey,
                        syncId: this.syncId,
                        nanogConnectionId: this.nangoConnectionId,
                        syncJobId: this.syncJobId
                    }
                });
            }

            throw new Error(responseResults?.error);
        }
    }

    public async batchDelete<T = any>(results: T[], model: string): Promise<boolean | null> {
        if (!results || results.length === 0) {
            if (this.dryRun) {
                console.log('batchDelete received an empty array. No records to delete.');
            }
            return true;
        }

        if (!this.nangoConnectionId || !this.syncId || !this.activityLogId || !this.syncJobId) {
            throw new Error('Nango Connection Id, Sync Id, Activity Log Id and Sync Job Id are all required');
        }

        const {
            success,
            error,
            response: formattedResults
        } = formatDataRecords(
            results as unknown as DataResponse[],
            this.nangoConnectionId as number,
            model,
            this.syncId as string,
            this.syncJobId,
            this.lastSyncDate,
            this.track_deletes,
            true
        );

        if (!success || formattedResults === null) {
            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: this.environmentId as number,
                    activity_log_id: this.activityLogId as number,
                    content: `There was an issue with the batch delete. ${error?.message}`,
                    timestamp: Date.now()
                });
            }

            throw error;
        }

        if (this.dryRun) {
            this.logMessages?.push(`A batch delete call would delete the following data:`);
            this.logMessages?.push(...results);
            return null;
        }

        const syncConfig = await getSyncConfigByJobId(this.syncJobId as number);

        if (syncConfig && !syncConfig?.models.includes(model)) {
            throw new Error(`The model: ${model} is not included in the declared sync models: ${syncConfig.models}.`);
        }

        const responseResults = await upsert(
            formattedResults,
            '_nango_sync_data_records',
            'external_id',
            this.nangoConnectionId as number,
            model,
            this.activityLogId as number,
            this.environmentId as number,
            this.track_deletes,
            true
        );

        if (responseResults.success) {
            const { summary } = responseResults;
            const updatedResults: Record<string, { added: number; updated: number; deleted: number }> = {
                [model]: {
                    added: summary?.addedKeys.length as number,
                    updated: summary?.updatedKeys.length as number,
                    deleted: summary?.deletedKeys?.length as number
                }
            };

            await createActivityLogMessage({
                level: 'info',
                environment_id: this.environmentId as number,
                activity_log_id: this.activityLogId as number,
                content: `Batch delete was a success and resulted in ${JSON.stringify(updatedResults, null, 2)}`,
                timestamp: Date.now()
            });

            await updateSyncJobResult(this.syncJobId as number, updatedResults, model);

            return true;
        } else {
            const content = `There was an issue with the batch delete. ${responseResults?.error}`;

            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: this.environmentId as number,
                    activity_log_id: this.activityLogId as number,
                    content,
                    timestamp: Date.now()
                });

                await errorManager.report(content, {
                    environmentId: this.environmentId as number,
                    source: ErrorSourceEnum.CUSTOMER,
                    operation: LogActionEnum.SYNC,
                    metadata: {
                        connectionId: this.connectionId,
                        providerConfigKey: this.providerConfigKey,
                        syncId: this.syncId,
                        nanogConnectionId: this.nangoConnectionId,
                        syncJobId: this.syncJobId
                    }
                });
            }

            throw new Error(responseResults?.error);
        }
    }

    public async batchUpdate<T = any>(results: T[], model: string): Promise<boolean | null> {
        if (!results || results.length === 0) {
            if (this.dryRun) {
                console.log('batchUpdate received an empty array. No records to update.');
            }
            return true;
        }

        if (!this.nangoConnectionId || !this.activityLogId) {
            throw new Error('Nango Connection Id, and Activity Log Id both required');
        }

        const {
            success,
            error,
            response: formattedResults
        } = formatDataRecords(
            results as unknown as DataResponse[],
            this.nangoConnectionId as number,
            model,
            this.syncId as string,
            this.syncJobId || 0,
            this.lastSyncDate,
            false
        );

        if (!success || formattedResults === null) {
            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: this.environmentId as number,
                    activity_log_id: this.activityLogId as number,
                    content: `There was an issue with the batch save. ${error?.message}`,
                    timestamp: Date.now()
                });
            }

            throw error;
        }

        if (this.dryRun) {
            this.logMessages?.push(`A batch update call would update the following data to the ${model} model:`);
            this.logMessages?.push(...results);
            return null;
        }

        const responseResults = await updateRecord(
            formattedResults,
            '_nango_sync_data_records',
            'external_id',
            this.nangoConnectionId as number,
            model,
            this.activityLogId as number,
            this.environmentId as number
        );

        if (responseResults.success) {
            const { summary } = responseResults;
            const updatedResults = {
                [model]: {
                    added: summary?.addedKeys.length as number,
                    updated: summary?.updatedKeys.length as number,
                    deleted: summary?.deletedKeys?.length as number
                }
            };

            await createActivityLogMessage({
                level: 'info',
                environment_id: this.environmentId as number,
                activity_log_id: this.activityLogId as number,
                content: `Batch update was a success and resulted in ${JSON.stringify(updatedResults, null, 2)}`,
                timestamp: Date.now()
            });

            await updateSyncJobResult(this.syncJobId as number, updatedResults, model);

            return true;
        } else {
            const content = `There was an issue with the batch update. ${responseResults?.error}`;

            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: this.environmentId as number,
                    activity_log_id: this.activityLogId as number,
                    content,
                    timestamp: Date.now()
                });

                await errorManager.report(content, {
                    environmentId: this.environmentId as number,
                    source: ErrorSourceEnum.CUSTOMER,
                    operation: LogActionEnum.SYNC,
                    metadata: {
                        connectionId: this.connectionId,
                        providerConfigKey: this.providerConfigKey,
                        syncId: this.syncId,
                        nanogConnectionId: this.nangoConnectionId,
                        syncJobId: this.syncJobId
                    }
                });
            }

            throw new Error(responseResults?.error);
        }
    }

    public override async getMetadata<T = Metadata>(): Promise<T> {
        if (this.dryRun && this.stubbedMetadata) {
            return this.stubbedMetadata as T;
        }

        return super.getMetadata<T>();
    }
}
