/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
import type { Nango } from '@nangohq/node';
import paginateService from './paginate.service.js';
import type { AxiosResponse } from 'axios';
import type {
    ApiKeyCredentials,
    ApiPublicConnectionFull,
    AppCredentials,
    AppStoreCredentials,
    BasicApiCredentials,
    BillCredentials,
    CustomCredentials,
    EnvironmentVariable,
    GetPublicConnection,
    GetPublicIntegration,
    JwtCredentials,
    MaybePromise,
    Metadata,
    NangoProps,
    OAuth1Token,
    OAuth2ClientCredentials,
    Pagination,
    SetMetadata,
    SignatureCredentials,
    TableauCredentials,
    TbaCredentials,
    TwoStepCredentials,
    UnauthCredentials,
    UpdateMetadata,
    UserLogParameters,
    UserProvidedProxyConfiguration
} from '@nangohq/types';
import { getProvider } from '@nangohq/providers';
import { AbortedSDKError, ActionError, UnknownProviderSDKError } from './errors.js';

const MEMOIZED_CONNECTION_TTL = 60000;
const MEMOIZED_INTEGRATION_TTL = 10 * 60 * 1000;

export type ProxyConfiguration = Omit<UserProvidedProxyConfiguration, 'files' | 'providerConfigKey' | 'connectionId'> & {
    providerConfigKey?: string;
    connectionId?: string;
};

export abstract class NangoActionBase {
    abstract nango: Nango;
    private attributes = {};
    activityLogId?: string | undefined;
    syncId?: string;
    nangoConnectionId?: number;
    environmentId: number;
    environmentName?: string;
    syncJobId?: number;
    abortSignal?: NangoProps['abortSignal'];
    syncConfig?: NangoProps['syncConfig'];
    runnerFlags: NangoProps['runnerFlags'];

    public connectionId: string;
    public providerConfigKey: string;
    public provider?: string;

    public ActionError = ActionError;

    protected memoizedConnections = new Map<string, { connection: ApiPublicConnectionFull; timestamp: number }>();
    protected memoizedIntegration = new Map<string, { integration: GetPublicIntegration['Success']['data']; timestamp: number }>();

    constructor(config: NangoProps) {
        this.connectionId = config.connectionId;
        this.environmentId = config.environmentId;
        this.providerConfigKey = config.providerConfigKey;
        this.runnerFlags = config.runnerFlags;

        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }

        if (config.syncId) {
            this.syncId = config.syncId;
        }

        if (config.nangoConnectionId) {
            this.nangoConnectionId = config.nangoConnectionId;
        }

        if (config.syncJobId) {
            this.syncJobId = config.syncJobId;
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

        if (config.syncConfig) {
            this.syncConfig = config.syncConfig;
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

    protected proxyConfig(config: ProxyConfiguration): UserProvidedProxyConfiguration {
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
            throw new AbortedSDKError();
        }
    }

    public abstract proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>>;

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

    public async getConnection(providerConfigKeyOverride?: string, connectionIdOverride?: string): Promise<GetPublicConnection['Success']> {
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

    public async setMetadata(metadata: Metadata): Promise<AxiosResponse<SetMetadata['Success']>> {
        this.throwIfAborted();
        try {
            return await this.nango.setMetadata(this.providerConfigKey, this.connectionId, metadata);
        } finally {
            this.memoizedConnections.delete(`${this.providerConfigKey}${this.connectionId}`);
        }
    }

    public async updateMetadata(metadata: Metadata): Promise<AxiosResponse<UpdateMetadata['Success']>> {
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
        console.warn('setFieldMapping is deprecated. Please use setMetadata instead.');
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
        console.warn('getFieldMapping is deprecated. Please use getMetadata instead.');
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
    public abstract log(message: any, options?: UserLogParameters | { [key: string]: any; level?: never }): MaybePromise<void>;
    public abstract log(message: string, ...args: [any, UserLogParameters]): MaybePromise<void>;
    public abstract log(...args: [...any]): MaybePromise<void>;

    public async getEnvironmentVariables(): Promise<EnvironmentVariable[] | null> {
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
            throw new UnknownProviderSDKError({ provider: this.provider });
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
        switch (paginationConfig.type) {
            case 'cursor':
                return yield* paginateService.cursor<T>(proxyConfig, paginationConfig, updatedBodyOrParams, passPaginationParamsInBody, this.proxy.bind(this));
            case 'link':
                return yield* paginateService.link<T>(proxyConfig, paginationConfig, updatedBodyOrParams, passPaginationParamsInBody, this.proxy.bind(this));
            case 'offset':
                return yield* paginateService.offset<T>(proxyConfig, paginationConfig, updatedBodyOrParams, passPaginationParamsInBody, this.proxy.bind(this));
            default:
                throw Error(`'${paginationConfig['type']}' pagination is not supported.}`);
        }
    }

    public async triggerAction<In = unknown, Out = object>(providerConfigKey: string, connectionId: string, actionName: string, input?: In): Promise<Out> {
        return await this.nango.triggerAction(providerConfigKey, connectionId, actionName, input);
    }

    public abstract triggerSync(providerConfigKey: string, connectionId: string, syncName: string, fullResync?: boolean): Promise<void | string>;
}
