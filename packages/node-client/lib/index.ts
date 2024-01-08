import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

import {
    AuthModes,
    CredentialsCommon,
    OAuth1Credentials,
    OAuth2Credentials,
    ProxyConfiguration,
    GetRecordsRequestConfig,
    ListRecordsRequestConfig,
    BasicApiCredentials,
    ApiKeyCredentials,
    AppCredentials,
    Metadata,
    Connection,
    ConnectionList,
    Integration,
    IntegrationWithCreds,
    SyncStatusResponse
} from './types.js';
import { validateProxyConfiguration, validateSyncRecordConfiguration } from './utils.js';

export const stagingHost = 'https://api-staging.nango.dev';
export const prodHost = 'https://api.nango.dev';

interface NangoProps {
    host?: string;
    secretKey: string;
    connectionId?: string;
    providerConfigKey?: string;
    isSync?: boolean;
    dryRun?: boolean;
    activityLogId?: number;
}

interface CreateConnectionOAuth1 extends OAuth1Credentials {
    connection_id: string;
    provider_config_key: string;
    type: AuthModes.OAuth1;
}

interface OAuth1Token {
    oAuthToken: string;
    oAuthTokenSecret: string;
}

interface CreateConnectionOAuth2 extends OAuth2Credentials {
    connection_id: string;
    provider_config_key: string;
    type: AuthModes.OAuth2;
}

interface CustomHeaders {
    [key: string]: string | number | boolean;
}

export enum SyncType {
    INITIAL = 'INITIAL',
    INCREMENTAL = 'INCREMENTAL'
}

export interface SyncResult {
    added: number;
    updated: number;
    deleted: number;
}

export interface NangoSyncWebhookBody {
    connectionId: string;
    providerConfigKey: string;
    syncName: string;
    model: string;
    responseResults: SyncResult;
    syncType: SyncType;
    queryTimeStamp: string | null;
}

export type LastAction = 'added' | 'updated' | 'deleted';

export interface RecordMetadata {
    first_seen_at: Date;
    last_seen_at: Date;
    last_action: LastAction;
    deleted_at: Date | null;
}

export class Nango {
    serverUrl: string;
    secretKey: string;
    connectionId?: string;
    providerConfigKey?: string;
    isSync = false;
    dryRun = false;
    activityLogId?: number;

    constructor(config: NangoProps) {
        config.host = config.host || prodHost;
        this.serverUrl = config.host;

        if (this.serverUrl.slice(-1) === '/') {
            this.serverUrl = this.serverUrl.slice(0, -1);
        }

        if (!config.secretKey) {
            throw new Error('You must specify a secret key (cf. documentation).');
        }

        try {
            new URL(this.serverUrl);
        } catch (err) {
            throw new Error(`Invalid URL provided for the Nango host: ${this.serverUrl}`);
        }

        this.secretKey = config.secretKey;
        this.connectionId = config.connectionId || '';
        this.providerConfigKey = config.providerConfigKey || '';

        if (config.isSync) {
            this.isSync = config.isSync;
        }

        if (config.dryRun) {
            this.dryRun = config.dryRun;
        }

        if (config.activityLogId) {
            this.activityLogId = config.activityLogId;
        }
    }

    /**
     * =======
     * INTEGRATIONS
     *      LIST
     *      GET
     *      CREATE
     *      UPDATE
     *      DELETE
     * =======
     */

    public async listIntegrations(): Promise<{ configs: Pick<Integration, 'unique_key' | 'provider'>[] }> {
        const url = `${this.serverUrl}/config`;
        const response = await axios.get(url, { headers: this.enrichHeaders({}) });

        return response.data;
    }

    public async getIntegration(providerConfigKey: string, includeIntegrationCredetials = false): Promise<{ config: Integration | IntegrationWithCreds }> {
        const url = `${this.serverUrl}/config/${providerConfigKey}`;
        const response = await axios.get(url, { headers: this.enrichHeaders({}), params: { include_creds: includeIntegrationCredetials } });
        return response.data;
    }

    public async createIntegration(provider: string, providerConfigKey: string, credentials?: Record<string, string>): Promise<{ config: Integration }> {
        const url = `${this.serverUrl}/config`;
        const response = await axios.post(url, { provider, provider_config_key: providerConfigKey, ...credentials }, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    public async updateIntegration(provider: string, providerConfigKey: string, credentials?: Record<string, string>): Promise<{ config: Integration }> {
        const url = `${this.serverUrl}/config`;
        const response = await axios.put(url, { provider, provider_config_key: providerConfigKey, ...credentials }, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    public async deleteIntegration(providerConfigKey: string): Promise<AxiosResponse<void>> {
        const url = `${this.serverUrl}/config/${providerConfigKey}`;
        return await axios.delete(url, { headers: this.enrichHeaders({}) });
    }

    /**
     * =======
     * CONNECTIONS
     *      LIST
     *      GET
     *      IMPORT / CREATE -- DEPRECATED use REST API
     *      GET TOKEN
     *      GET RAW TOKEN
     *      GET METADATA
     *      SET METADATA
     *      DELETE
     * =======
     */

    /**
     * Get the list of Connections, which does not contain access credentials.
     */
    public async listConnections(connectionId?: string): Promise<{ connections: ConnectionList[] }> {
        const response = await this.listConnectionDetails(connectionId);
        return response.data;
    }
    /**
     * Get the Connection object, which also contains access credentials and full credentials payload
     * returned by the external API.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     * @param [refreshToken] - When set this returns the refresh token as part of the response
     */
    public async getConnection(providerConfigKey: string, connectionId: string, forceRefresh?: boolean, refreshToken?: boolean): Promise<Connection> {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh, refreshToken);
        return response.data;
    }

    public async importConnection(_connectionArgs: CreateConnectionOAuth1 | (CreateConnectionOAuth2 & { metadata: string; connection_config: string })) {
        throw new Error(
            'This method has been deprecated, please use the REST API to import a connection. See https://docs.nango.dev/api-reference/connection/post'
        );
    }

    public async createConnection(_connectionArgs: CreateConnectionOAuth1 | (CreateConnectionOAuth2 & { metadata: string; connection_config: string })) {
        throw new Error(
            'This method has been deprecated, please use the REST API to create a connection. See https://docs.nango.dev/api-reference/connection/post'
        );
    }

    /**
     * For OAuth 2: returns the access token directly as a string.
     * For OAuth 2: If you want to obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true."
     * For OAuth 1: returns an object with 'oAuthToken' and 'oAuthTokenSecret' fields.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     * */
    public async getToken(
        providerConfigKey: string,
        connectionId: string,
        forceRefresh?: boolean
    ): Promise<string | OAuth1Token | BasicApiCredentials | ApiKeyCredentials | AppCredentials> {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);

        switch (response.data.credentials.type) {
            case AuthModes.OAuth2:
                return response.data.credentials.access_token;
            case AuthModes.OAuth1:
                return { oAuthToken: response.data.credentials.oauth_token, oAuthTokenSecret: response.data.credentials.oauth_token_secret };
            default:
                return response.data.credentials;
        }
    }

    /**
     * Get the full (fresh) credentials payload returned by the external API,
     * which also contains access credentials.
     * @param providerConfigKey - This is the unique Config Key for the integration
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param [forceRefresh] - When set, this is used to  obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true.
     * */
    public async getRawTokenResponse<T = Record<string, any>>(providerConfigKey: string, connectionId: string, forceRefresh?: boolean): Promise<T> {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);
        const credentials = response.data.credentials as CredentialsCommon;
        return credentials.raw as T;
    }

    public async getMetadata<T = Metadata>(providerConfigKey: string, connectionId: string): Promise<T> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!connectionId) {
            throw new Error('Connection Id is required');
        }

        const response = await this.getConnectionDetails(providerConfigKey, connectionId, false, false, {
            'Nango-Is-Sync': true,
            'Nango-Is-Dry-Run': this.dryRun
        });

        return response.data.metadata as T;
    }

    public async setMetadata(providerConfigKey: string, connectionId: string, metadata: Record<string, any>): Promise<AxiosResponse<void>> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!connectionId) {
            throw new Error('Connection Id is required');
        }

        if (!metadata) {
            throw new Error('Metadata is required');
        }

        const url = `${this.serverUrl}/connection/${connectionId}/metadata?provider_config_key=${providerConfigKey}`;

        const headers: Record<string, string | number | boolean> = {
            'Provider-Config-Key': providerConfigKey as string
        };

        return axios.post(url, metadata, { headers: this.enrichHeaders(headers) });
    }

    public async updateMetadata(providerConfigKey: string, connectionId: string, metadata: Record<string, any>): Promise<AxiosResponse<void>> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!connectionId) {
            throw new Error('Connection Id is required');
        }

        if (!metadata) {
            throw new Error('Metadata is required');
        }

        const url = `${this.serverUrl}/connection/${connectionId}/metadata?provider_config_key=${providerConfigKey}`;

        const headers: Record<string, string | number | boolean> = {
            'Provider-Config-Key': providerConfigKey as string
        };

        return axios.patch(url, metadata, { headers: this.enrichHeaders(headers) });
    }

    public async deleteConnection(providerConfigKey: string, connectionId: string): Promise<AxiosResponse<void>> {
        const url = `${this.serverUrl}/connection/${connectionId}?provider_config_key=${providerConfigKey}`;

        const headers = {
            'Content-Type': 'application/json'
        };

        return axios.delete(url, { headers: this.enrichHeaders(headers) });
    }

    /**
     * =======
     * SYNCS
     *      GET RECORDS
     *      TRIGGER
     *      START
     *      PAUSE
     *      STATUS
     *      GET ENVIRONMENT VARIABLES
     * =======
     */

    public async getRecords<T = any>(config: GetRecordsRequestConfig): Promise<(T & { _nango_metadata: RecordMetadata })[]> {
        const { connectionId, providerConfigKey, model, delta, offset, limit, includeNangoMetadata, filter } = config;
        validateSyncRecordConfiguration(config);

        const order = config?.order === 'asc' ? 'asc' : 'desc';

        let sortBy = 'id';
        switch (config.sortBy) {
            case 'createdAt':
                sortBy = 'created_at';
                break;
            case 'updatedAt':
                sortBy = 'updated_at';
                break;
        }

        if (includeNangoMetadata) {
            console.warn(
                `The includeNangoMetadata option will be deprecated soon and will be removed in a future release. Each record now has a _nango_metadata property which includes the same properties.`
            );
        }
        const includeMetadata = includeNangoMetadata || false;

        const url = `${this.serverUrl}/sync/records/?model=${model}&order=${order}&delta=${delta || ''}&offset=${offset || ''}&limit=${limit || ''}&sort_by=${
            sortBy || ''
        }&include_nango_metadata=${includeMetadata}${filter ? `&filter=${filter}` : ''}`;

        const headers: Record<string, string | number | boolean> = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        const options = {
            headers: this.enrichHeaders(headers)
        };

        const response = await axios.get(url, options);

        return response.data;
    }

    public async listRecords<T = any>(
        config: ListRecordsRequestConfig
    ): Promise<{ records: (T & { _nango_metadata: RecordMetadata })[]; next_cursor: string | null }> {
        const { connectionId, providerConfigKey, model, delta, limit, filter, cursor } = config;
        validateSyncRecordConfiguration(config);

        const url = `${this.serverUrl}/records/?model=${model}${delta ? `&delta=${delta}` : ''}${limit ? `&limit=${limit}` : ''}${
            filter ? `&filter=${filter}` : ''
        }${cursor ? `&cursor=${cursor}` : ''}`;

        const headers: Record<string, string | number | boolean> = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        const options = {
            headers: this.enrichHeaders(headers)
        };

        const response = await axios.get(url, options);

        return response.data;
    }

    public async triggerSync(providerConfigKey: string, syncs?: string[], connectionId?: string): Promise<void> {
        const url = `${this.serverUrl}/sync/trigger`;

        if (typeof syncs === 'string') {
            throw new Error('Syncs must be an array of strings. If it is a single sync, please wrap it in an array.');
        }

        const body = {
            syncs: syncs || [],
            provider_config_key: providerConfigKey,
            connection_id: connectionId
        };

        return axios.post(url, body, { headers: this.enrichHeaders() });
    }

    public async startSync(providerConfigKey: string, syncs: string[], connectionId?: string): Promise<void> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!syncs) {
            throw new Error('Sync is required');
        }

        if (typeof syncs === 'string') {
            throw new Error('Syncs must be an array of strings. If it is a single sync, please wrap it in an array.');
        }

        const body = {
            syncs: syncs || [],
            provider_config_key: providerConfigKey,
            connection_id: connectionId
        };

        const url = `${this.serverUrl}/sync/start`;

        return axios.post(url, body, { headers: this.enrichHeaders() });
    }

    public async pauseSync(providerConfigKey: string, syncs: string[], connectionId?: string): Promise<void> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!syncs) {
            throw new Error('Sync is required');
        }

        if (typeof syncs === 'string') {
            throw new Error('Syncs must be an array of strings. If it is a single sync, please wrap it in an array.');
        }

        const url = `${this.serverUrl}/sync/pause`;

        const body = {
            syncs: syncs || [],
            provider_config_key: providerConfigKey,
            connection_id: connectionId
        };

        return axios.post(url, body, { headers: this.enrichHeaders() });
    }

    public async syncStatus(providerConfigKey: string, syncs: '*' | string[], connectionId?: string): Promise<SyncStatusResponse> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!syncs) {
            throw new Error('Sync is required');
        }

        if (typeof syncs === 'string' && syncs !== '*') {
            throw new Error('Syncs must be an array of strings. If it is a single sync, please wrap it in an array.');
        }

        const url = `${this.serverUrl}/sync/status`;

        const params = {
            syncs: syncs === '*' ? '*' : syncs.join(','),
            provider_config_key: providerConfigKey,
            connection_id: connectionId
        };

        const response = await axios.get(url, { headers: this.enrichHeaders(), params });

        return response.data;
    }

    public async getEnvironmentVariables(): Promise<{ name: string; value: string }[]> {
        const url = `${this.serverUrl}/environment-variables`;

        const headers = {
            'Content-Type': 'application/json'
        };

        const response = await axios.get(url, { headers: this.enrichHeaders(headers) });

        if (!response.data) {
            return [];
        }

        return response.data;
    }

    /**
     * =======
     * ACTIONS
     *      TRIGGER
     * =======
     */

    public async triggerAction(providerConfigKey: string, connectionId: string, actionName: string, input?: unknown): Promise<object> {
        const url = `${this.serverUrl}/action/trigger`;

        const headers = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        const body = {
            action_name: actionName,
            input
        };

        const response = await axios.post(url, body, { headers: this.enrichHeaders(headers) });

        return response.data;
    }

    /**
     * =======
     * PROXY
     *      GET
     *      POST
     *      PUT
     *      PATCH
     *      DELETE
     * =======
     */

    public async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        if (!config.connectionId && this.connectionId) {
            config.connectionId = this.connectionId;
        }

        if (!config.providerConfigKey && this.providerConfigKey) {
            config.providerConfigKey = this.providerConfigKey;
        }

        validateProxyConfiguration(config);

        const { providerConfigKey, connectionId, method, retries, headers: customHeaders, baseUrlOverride, decompress } = config;

        const url = `${this.serverUrl}/proxy${config.endpoint[0] === '/' ? '' : '/'}${config.endpoint}`;

        const customPrefixedHeaders: CustomHeaders =
            customHeaders && Object.keys(customHeaders as CustomHeaders).length > 0
                ? Object.keys(customHeaders as CustomHeaders).reduce((acc: CustomHeaders, key: string) => {
                      acc[`Nango-Proxy-${key}`] = customHeaders[key] as string;
                      return acc;
                  }, {})
                : ({} as CustomHeaders);

        const headers: Record<string, string | number | boolean | CustomHeaders> = {
            'Connection-Id': connectionId as string,
            'Provider-Config-Key': providerConfigKey as string,
            'Base-Url-Override': baseUrlOverride || '',
            'Nango-Is-Sync': this.isSync,
            'Nango-Is-Dry-Run': this.dryRun,
            'Nango-Activity-Log-Id': this.activityLogId || '',
            ...customPrefixedHeaders
        };

        if (retries) {
            headers['Retries'] = retries;
        }

        if (decompress) {
            headers['Decompress'] = decompress;
        }

        const options: AxiosRequestConfig = {
            headers: this.enrichHeaders(headers as Record<string, string | number | boolean>)
        };

        if (config.params) {
            options.params = config.params;
        }

        if (config.paramsSerializer) {
            options.paramsSerializer = config.paramsSerializer;
        }

        if (config.responseType) {
            options.responseType = config.responseType;
        }

        if (this.dryRun) {
            const stringifyParams = (params: Record<string, string>) => {
                return Object.keys(params)
                    .map((key: string) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] as string)}`)
                    .join('&');
            };

            console.log(
                `Nango Proxy Request: ${method?.toUpperCase()} ${url}${config.params ? `?${stringifyParams(config.params as Record<string, string>)}` : ''}`
            );
        }

        if (method?.toUpperCase() === 'POST') {
            return axios.post(url, config.data, options);
        } else if (method?.toUpperCase() === 'PATCH') {
            return axios.patch(url, config.data, options);
        } else if (method?.toUpperCase() === 'PUT') {
            return axios.put(url, config.data, options);
        } else if (method?.toUpperCase() === 'DELETE') {
            return axios.delete(url, options);
        } else {
            return axios.get(url, options);
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

    private async getConnectionDetails(
        providerConfigKey: string,
        connectionId: string,
        forceRefresh = false,
        refreshToken = false,
        additionalHeader = {}
    ): Promise<AxiosResponse<Connection>> {
        const url = `${this.serverUrl}/connection/${connectionId}`;

        const headers = {
            'Content-Type': 'application/json',
            'Nango-Is-Sync': this.isSync,
            'Nango-Is-Dry-Run': this.dryRun
        };

        if (additionalHeader) {
            Object.assign(headers, additionalHeader);
        }

        const params = {
            provider_config_key: providerConfigKey,
            force_refresh: forceRefresh,
            refresh_token: refreshToken
        };

        return axios.get(url, { params: params, headers: this.enrichHeaders(headers) });
    }

    private async listConnectionDetails(connectionId?: string): Promise<AxiosResponse<{ connections: ConnectionList[] }>> {
        let url = `${this.serverUrl}/connection?`;
        if (connectionId) {
            url = url.concat(`connectionId=${connectionId}`);
        }

        const headers = {
            'Content-Type': 'application/json'
        };

        return axios.get(url, { headers: this.enrichHeaders(headers) });
    }

    private enrichHeaders(headers: Record<string, string | number | boolean> = {}): Record<string, string | number | boolean> {
        headers['Authorization'] = 'Bearer ' + this.secretKey;

        return headers;
    }
}
