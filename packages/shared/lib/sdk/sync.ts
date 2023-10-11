import { getSyncConfigByJobId } from '../services/sync/config/config.service.js';
import { upsert } from '../services/sync/data/data.service.js';
import { formatDataRecords } from '../services/sync/data/records.service.js';
import { createActivityLogMessage } from '../services/activity/activity.service.js';
import { setLastSyncDate } from '../services/sync/sync.service.js';
import { updateSyncJobResult } from '../services/sync/job.service.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { LogActionEnum } from '../models/Activity.js';

import { Nango } from '@nangohq/node';
import configService from '../services/config.service.js';
import type { Template } from '../models/index.js';
import { isValidHttpUrl } from '../utils/utils.js';
import parseLinksHeader from 'parse-link-header';

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

interface AxiosResponse<T = any, D = any> {
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

export enum PaginationType {
    CURSOR = 'cursor',
    LINK_REL = 'link_rel',
    URL = 'url'
}

interface Pagination {
    type: PaginationType;
    limit?: number;
    response_data_path?: string;
    limit_parameter_name: string;
}

export interface CursorPagination extends Pagination {
    type: PaginationType.CURSOR;
    next_cursor_parameter_path: string;
    cursor_parameter_name: string;
}

export interface LinkRelPagination extends Pagination {
    type: PaginationType.LINK_REL;
    link_rel: string;
}

export interface UrlPagination extends Pagination {
    type: PaginationType.URL;
    next_url_parameter_path: string;
}

interface ProxyConfiguration {
    endpoint: string;
    providerConfigKey?: string;
    connectionId?: string;

    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    headers?: Record<string, string>;
    params?: string | Record<string, string>;
    paramsSerializer?: ParamsSerializerOptions;
    data?: unknown;
    retries?: number;
    baseUrlOverride?: string;
    paginate?: Record<string, any>; // Supported only by Syncs and Actions ATM
}

enum AuthModes {
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2',
    Basic = 'BASIC',
    ApiKey = 'API_KEY'
}

interface BasicApiCredentials {
    type?: AuthModes.Basic;
    username: string;
    password: string;
}

interface ApiKeyCredentials {
    type?: AuthModes.ApiKey;
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

type AuthCredentials = OAuth2Credentials | OAuth1Credentials | BasicApiCredentials | ApiKeyCredentials;

interface Metadata {
    [key: string]: string | Record<string, string>;
}

interface Connection {
    id?: number;
    created_at?: string;
    updated_at?: string;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata: Metadata | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    credentials: AuthCredentials;
}

interface NangoProps {
    host?: string;
    secretKey: string;
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
        return this.nango.proxy(config);
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

    public async setMetadata(metadata: Record<string, string>): Promise<AxiosResponse<void>> {
        return this.nango.setMetadata(this.providerConfigKey as string, this.connectionId as string, metadata);
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

        await createActivityLogMessage({
            level: userDefinedLevel?.level ?? 'info',
            activity_log_id: this.activityLogId as number,
            content,
            timestamp: Date.now()
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
        if (!this.providerConfigKey) {
            throw Error(`Please, specify provider config key`);
        }

        const providerConfigKey: string = this.providerConfigKey;
        const template: Template = configService.getTemplate(providerConfigKey);
        const templatePaginationConfig: Pagination | undefined = template.proxy?.paginate;

        if (!templatePaginationConfig) {
            throw Error(`Pagination is not supported for ${providerConfigKey}. Please, add pagination config to 'providers.yaml' file`);
        }

        let paginationConfig: Pagination = templatePaginationConfig;
        if (config.paginate) {
            const paginationConfigOverride: Record<string, any> = config.paginate as Record<string, any>;

            if (paginationConfigOverride) {
                paginationConfig = { ...paginationConfig, ...paginationConfigOverride };
            }
        }

        if (!config.method) {
            // default to get if user doesn't specify a different method themselves
            config.method = 'GET';
        }

        const configMethod: string = config.method.toLocaleLowerCase();
        let passPaginationParamsInBody: boolean = ['post', 'put', 'patch'].includes(configMethod);

        const updatedBodyOrParams: Record<string, string> = ((passPaginationParamsInBody ? config.data : config.params) as Record<string, string>) ?? {};
        const limitParameterName: string = paginationConfig.limit_parameter_name;

        if (paginationConfig['limit']) {
            const limit: string = paginationConfig['limit'] as unknown as string;
            updatedBodyOrParams[limitParameterName] = limit;
        }

        switch (paginationConfig.type) {
            case PaginationType.CURSOR: {
                const cursorBasedPagination: CursorPagination = paginationConfig as CursorPagination;

                let nextCursor: string | undefined;
                while (true) {
                    if (nextCursor) {
                        updatedBodyOrParams[cursorBasedPagination.cursor_parameter_name] = `${nextCursor}`;
                    }

                    this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);

                    const response: AxiosResponse = await this.proxy(config);

                    const responseData: T[] = cursorBasedPagination.response_data_path
                        ? this.getNestedField(response.data, cursorBasedPagination.response_data_path)
                        : response.data;
                    if (!responseData.length) {
                        return;
                    }

                    yield responseData;

                    nextCursor = this.getNestedField(response.data, cursorBasedPagination.next_cursor_parameter_path);

                    if (!nextCursor || nextCursor.trim().length === 0) {
                        return;
                    }
                }
            }
            case PaginationType.LINK_REL: {
                const linkRelPagination: LinkRelPagination = paginationConfig as LinkRelPagination;

                this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);
                while (true) {
                    const response: AxiosResponse = await this.proxy(config);

                    const responseData: T[] = paginationConfig.response_data_path
                        ? this.getNestedField(response.data, paginationConfig.response_data_path)
                        : response.data;
                    if (!responseData.length) {
                        return;
                    }

                    yield responseData;

                    const linkHeader = parseLinksHeader(response.headers['link']);
                    const nextPageUrl: string | undefined = linkHeader?.[linkRelPagination.link_rel]?.url;

                    if (nextPageUrl && isValidHttpUrl(nextPageUrl)) {
                        this.updateProxyConfigEndpointAndParams(nextPageUrl, config);
                    } else {
                        return;
                    }
                }
            }
            case PaginationType.URL: {
                const urlPagination: UrlPagination = paginationConfig as UrlPagination;

                this.updateConfigBodyOrParams(passPaginationParamsInBody, config, updatedBodyOrParams);
                while (true) {
                    const response: AxiosResponse = await this.proxy(config);

                    const responseData: T[] = paginationConfig.response_data_path
                        ? this.getNestedField(response.data, paginationConfig.response_data_path)
                        : response.data;
                    if (!responseData.length) {
                        return;
                    }

                    yield responseData;

                    const nextPageUrl: string | undefined = this.getNestedField(response.data, urlPagination.next_url_parameter_path);
                    if (nextPageUrl && isValidHttpUrl(nextPageUrl)) {
                        this.updateProxyConfigEndpointAndParams(nextPageUrl, config);
                    } else {
                        return;
                    }
                }
            }
            default:
                throw Error(`'${paginationConfig.type} ' pagination is not supported. Please, make sure it's one of ${Object.values(PaginationType)} `);
        }
    }

    private updateProxyConfigEndpointAndParams(nextPageUrl: string, config: ProxyConfiguration) {
        const url = new URL(nextPageUrl);
        const searchParams: URLSearchParams = url.searchParams;
        const path = url.pathname;
        config.endpoint = path;
        config.params = {
            ...(config.params as Record<string, string>),
            ...Object.fromEntries(searchParams.entries())
        };
    }

    private updateConfigBodyOrParams(passPaginationParamsInBody: boolean, config: ProxyConfiguration, updatedBodyOrParams: Record<string, string>) {
        if (passPaginationParamsInBody) {
            config.data = updatedBodyOrParams;
        } else {
            config.params = updatedBodyOrParams;
        }
    }

    private getNestedField(object: any, path: string, defaultValue?: any): any {
        // TODO: extract to util or figure out how to use lodash
        const keys = path.split('.');
        let result = object;

        for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
                result = result[key];
            } else {
                return defaultValue;
            }
        }

        return result !== undefined ? result : defaultValue;
    }
}

export class NangoSync extends NangoAction {
    lastSyncDate?: Date;
    track_deletes = false;

    constructor(config: NangoProps) {
        super(config);

        if (config.lastSyncDate) {
            this.lastSyncDate = config.lastSyncDate;
        }

        if (config.track_deletes) {
            this.track_deletes = config.track_deletes;
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
                console.log('batchSave received an empty array. No records to send.');
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
        } = formatDataRecords(results as unknown as DataResponse[], this.nangoConnectionId as number, model, this.syncId as string, this.syncJobId);

        if (!success || formattedResults === null) {
            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: this.activityLogId as number,
                    content: `There was an issue with the batch save.${error?.message} `,
                    timestamp: Date.now()
                });
            }

            throw error;
        }

        if (this.dryRun) {
            console.log('A batch save call would save following data:');
            console.log(JSON.stringify(results, null, 2));
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
            syncConfig?.track_deletes
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
                activity_log_id: this.activityLogId as number,
                content: `Batch save was a success and resulted in ${JSON.stringify(updatedResults, null, 2)} `,
                timestamp: Date.now()
            });

            await updateSyncJobResult(this.syncJobId as number, updatedResults, model);

            return true;
        } else {
            const content = `There was an issue with the batch save.${responseResults?.error} `;

            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
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
        } = formatDataRecords(results as unknown as DataResponse[], this.nangoConnectionId as number, model, this.syncId as string, this.syncJobId, true);

        if (!success || formattedResults === null) {
            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: this.activityLogId as number,
                    content: `There was an issue with the batch delete.${error?.message} `,
                    timestamp: Date.now()
                });
            }

            throw error;
        }

        if (this.dryRun) {
            console.log('A batch delete call would delete the following data:');
            console.log(JSON.stringify(results, null, 2));
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
            syncConfig?.track_deletes,
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
                activity_log_id: this.activityLogId as number,
                content: `Batch delete was a success and resulted in ${JSON.stringify(updatedResults, null, 2)} `,
                timestamp: Date.now()
            });

            await updateSyncJobResult(this.syncJobId as number, updatedResults, model);

            return true;
        } else {
            const content = `There was an issue with the batch delete.${responseResults?.error} `;

            if (!this.dryRun) {
                await createActivityLogMessage({
                    level: 'error',
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
}
