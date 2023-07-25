import { getSyncConfigByJobId } from '../services/sync/config.service.js';
import { upsert } from '../services/sync/data.service.js';
import { formatDataRecords } from '../services/sync/data-records.service.js';
import { createActivityLogMessage } from '../services/activity/activity.service.js';
import { updateSyncJobResult } from '../services/sync/job.service.js';

import { Nango } from '@nangohq/node';

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

interface Connection {
    id?: number;
    created_at?: string;
    updated_at?: string;
    provider_config_key: string;
    connection_id: string;
    connection_config: Record<string, string>;
    environment_id: number;
    metadata: Record<string, string> | null;
    credentials_iv?: string | null;
    credentials_tag?: string | null;
    field_mappings?: Record<string, string>;
    credentials: AuthCredentials;
}

interface NangoProps {
    host?: string;
    secretKey: string;
    connectionId?: string;
    activityLogId?: number;
    providerConfigKey?: string;
    lastSyncDate?: Date;
    syncId?: string | undefined;
    nangoConnectionId?: number;
    syncJobId?: number | undefined;
    dryRun?: boolean;
}

interface UserLogParameters {
    level?: LogLevel;
}

export class NangoSync {
    private nango: Nango;
    activityLogId?: number;
    lastSyncDate?: Date;
    syncId?: string;
    nangoConnectionId?: number;
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
    }

    public setLastSyncDate(date: Date): void {
        this.lastSyncDate = date;
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

    public async setFieldMapping(fieldMapping: Record<string, string>, optionalProviderConfigKey?: string, optionalConnectionId?: string): Promise<void> {
        return this.nango.setFieldMapping(fieldMapping, optionalProviderConfigKey, optionalConnectionId);
    }

    public async getFieldMapping(optionalProviderConfigKey?: string, optionalConnectionId?: string): Promise<Record<string, string>> {
        return this.nango.getFieldMapping(optionalProviderConfigKey, optionalConnectionId);
    }

    public async batchSend<T = any>(results: T[], model: string): Promise<boolean | null> {
        if (this.dryRun) {
            console.log('A batch send call would send the following data:');
            console.log(JSON.stringify(results, null, 2));
            return null;
        }

        if (!this.nangoConnectionId || !this.syncId || !this.activityLogId || !this.syncJobId) {
            throw new Error('Nango Connection Id, Sync Id, Activity Log Id and Sync Job Id are all required');
        }

        const formattedResults = formatDataRecords(
            results as unknown as DataResponse[],
            this.nangoConnectionId as number,
            model,
            this.syncId as string,
            this.syncJobId
        );

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
            this.activityLogId as number
        );

        if (responseResults.success) {
            const { summary } = responseResults;
            const updatedResults = {
                [model]: {
                    added: summary?.addedKeys.length as number,
                    updated: summary?.updatedKeys.length as number
                }
            };

            await createActivityLogMessage({
                level: 'info',
                activity_log_id: this.activityLogId as number,
                content: `Batch send was a success and resulted in ${JSON.stringify(updatedResults, null, 2)}`,
                timestamp: Date.now()
            });

            await updateSyncJobResult(this.syncJobId as number, updatedResults, model);

            return true;
        } else {
            await createActivityLogMessage({
                level: 'error',
                activity_log_id: this.activityLogId as number,
                content: `There was an issue with the batch send. ${responseResults?.error}`,
                timestamp: Date.now()
            });

            return false;
        }
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
}
