import crypto from 'node:crypto';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosInterceptorManager } from 'axios';
import axios from 'axios';
import https from 'node:https';

import type {
    ApiKeyCredentials,
    AppCredentials,
    OAuth1Token,
    AppStoreCredentials,
    BasicApiCredentials,
    CredentialsCommon,
    CustomCredentials,
    OAuth2ClientCredentials,
    TbaCredentials,
    TableauCredentials,
    UnauthCredentials,
    BillCredentials,
    GetPublicProviders,
    GetPublicProvider,
    GetPublicListIntegrations,
    GetPublicListIntegrationsLegacy,
    GetPublicIntegration,
    PostConnectSessions,
    JwtCredentials,
    TwoStepCredentials,
    GetPublicConnections,
    SignatureCredentials,
    PostPublicConnectSessionsReconnect,
    GetPublicConnection
} from '@nangohq/types';
import type {
    CreateConnectionOAuth1,
    CreateConnectionOAuth2,
    Integration,
    IntegrationWithCreds,
    ListRecordsRequestConfig,
    Metadata,
    MetadataChangeResponse,
    NangoProps,
    ProxyConfiguration,
    RecordMetadata,
    StandardNangoConfig,
    SyncStatusResponse,
    UpdateSyncFrequencyResponse
} from './types.js';
import { addQueryParams, getUserAgent, validateProxyConfiguration, validateSyncRecordConfiguration } from './utils.js';

export const prodHost = 'https://api.nango.dev';

export * from './types.js';
export { getUserAgent } from './utils.js';

type CustomHeaders = Record<string, string | number | boolean>;

export enum SyncType {
    INITIAL = 'INITIAL',
    INCREMENTAL = 'INCREMENTAL'
}

const defaultHttpsAgent = new https.Agent({ keepAlive: true });

export interface AdminAxiosProps {
    userAgent?: string;
    interceptors?: {
        request?: AxiosInterceptorManager<AxiosRequestConfig>;
        response?: {
            onFulfilled: (value: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
            onRejected?: (error: unknown) => unknown;
        };
    };
}

export class Nango {
    serverUrl: string;
    secretKey: string;
    connectionId?: string;
    providerConfigKey?: string;
    isSync = false;
    dryRun = false;
    activityLogId?: string | undefined;
    userAgent: string;
    http: AxiosInstance;

    constructor(config: NangoProps, { userAgent, interceptors }: AdminAxiosProps = {}) {
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
        } catch {
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

        this.userAgent = getUserAgent(userAgent);
        this.http = axios.create({
            httpsAgent: defaultHttpsAgent,
            headers: {
                'User-Agent': this.userAgent
            }
        });

        if (interceptors?.response) {
            this.http.interceptors.response.use(interceptors.response.onFulfilled, interceptors.response.onRejected);
        }
    }

    /****************
     * Providers
     *****************/
    /**
     * Returns a list of all available providers
     * @returns A promise that resolves with an object containing an array of providers
     */
    public async listProviders(queries: GetPublicProviders['Querystring']): Promise<GetPublicProviders['Success']> {
        const url = new URL(`${this.serverUrl}/providers`);
        addQueryParams(url, queries);

        const response = await this.http.get(url.href, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    /**
     * Returns a specific provider
     * @returns A promise that resolves with an object containing a provider
     */
    public async getProvider(params: GetPublicProvider['Params']): Promise<GetPublicProvider['Success']> {
        const response = await this.http.get(`${this.serverUrl}/providers/${params.provider}`, { headers: this.enrichHeaders({}) });
        return response.data;
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

    /**
     * Returns a list of integrations
     * @returns A promise that resolves with an object containing an array of integrations
     */
    public async listIntegrations(): Promise<GetPublicListIntegrationsLegacy['Success']> {
        const url = `${this.serverUrl}/integrations`;
        const response = await this.http.get(url, { headers: this.enrichHeaders({}) });

        const tmp: GetPublicListIntegrations['Success'] = response.data;
        // To avoid deprecating this method we emulate legacy format
        return { configs: tmp.data };
    }

    /**
     * Returns a specific integration
     * @param uniqueKey - The key identifying the provider configuration on Nango
     * @returns A promise that resolves with an object containing an integration
     */
    public async getIntegration(
        params: GetPublicIntegration['Params'],
        queries?: GetPublicIntegration['Querystring']
    ): Promise<GetPublicIntegration['Success']>;

    /**
     * Returns a specific integration
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param includeIntegrationCredentials - An optional flag indicating whether to include integration credentials in the response. Default is false
     * @returns A promise that resolves with an object containing an integration configuration
     * @deprecated Use `getIntegration({ unique_key })`
     */
    public async getIntegration(providerConfigKey: string, includeIntegrationCredentials?: boolean): Promise<{ config: Integration | IntegrationWithCreds }>;

    public async getIntegration(
        params: string | GetPublicIntegration['Params'],
        queries?: boolean | GetPublicIntegration['Querystring']
    ): Promise<{ config: Integration | IntegrationWithCreds } | GetPublicIntegration['Success']> {
        const headers = { 'Content-Type': 'application/json' };

        if (typeof params === 'string') {
            const url = `${this.serverUrl}/config/${params}`;
            const response = await this.http.get(url, { headers: this.enrichHeaders(headers), params: { include_creds: queries } });
            return response.data;
        } else {
            const url = new URL(`${this.serverUrl}/integrations/${params.uniqueKey}`);
            addQueryParams(url, queries as GetPublicIntegration['Querystring']);

            const response = await this.http.get(url.href, { headers: this.enrichHeaders(headers) });
            return response.data;
        }
    }

    /**
     * Creates a new integration with the specified provider and configuration key
     * Optionally, you can provide credentials for the integration
     * @param provider - The provider of the integration
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param credentials - Optional credentials for the integration
     * @returns A promise that resolves with the created integration configuration
     */
    public async createIntegration(provider: string, providerConfigKey: string, credentials?: Record<string, string>): Promise<{ config: Integration }> {
        const url = `${this.serverUrl}/config`;
        const response = await this.http.post(url, { provider, provider_config_key: providerConfigKey, ...credentials }, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    /**
     * Updates an integration with the specified provider and configuration key
     * Only integrations using OAuth 1 & 2 can be updated, not integrations using API keys & Basic auth (because there is nothing to update for them)
     * @param provider - The Nango API Configuration (cf. [providers.yaml](https://github.com/NangoHQ/nango/blob/master/packages/providers/providers.yaml))
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param credentials - Optional credentials to include, depending on the specific integration that you want to update
     * @returns A promise that resolves with the updated integration configuration object
     */
    public async updateIntegration(provider: string, providerConfigKey: string, credentials?: Record<string, string>): Promise<{ config: Integration }> {
        const url = `${this.serverUrl}/config`;
        const response = await this.http.put(url, { provider, provider_config_key: providerConfigKey, ...credentials }, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    /**
     * Deletes an integration with the specified configuration key
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @returns A promise that resolves with the response from the server
     */
    public async deleteIntegration(providerConfigKey: string): Promise<AxiosResponse<void>> {
        const url = `${this.serverUrl}/config/${providerConfigKey}`;
        return await this.http.delete(url, { headers: this.enrichHeaders({}) });
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
     * Returns a list of connections, optionally filtered by connection ID
     * @param connectionId - Optional. Will exactly match a given connectionId. Can return multiple connections with the same ID across integrations
     * @param search - Optional. Search connections. Will search in connection ID or end user profile.
     * @returns A promise that resolves with an array of connection objects
     */
    public async listConnections(
        connectionId?: string,
        search?: string,
        queries?: Omit<GetPublicConnections['Querystring'], 'connectionId' | 'search'>
    ): Promise<GetPublicConnections['Success']> {
        const url = new URL(`${this.serverUrl}/connection`);
        if (connectionId) {
            url.searchParams.append('connectionId', connectionId);
        }
        if (search) {
            url.searchParams.append('search', search);
        }
        if (queries?.endUserId) {
            url.searchParams.append('endUserId', queries.endUserId);
        }
        if (queries?.endUserOrganizationId) {
            url.searchParams.append('endUserOrganizationId', queries.endUserOrganizationId);
        }

        const headers = {
            'Content-Type': 'application/json'
        };

        const response = await this.http.get(url.href, { headers: this.enrichHeaders(headers) });
        return response.data;
    }

    /**
     * Returns a connection object, which also contains access credentials and full credentials payload
     * @param providerConfigKey - The integration ID used to create the connection (i.e Unique Key)
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param forceRefresh - Optional. When set to true, this obtains a new access token from the provider before the current token has expired
     * @param refreshToken - Optional. When set to true, this returns the refresh token as part of the response
     * @returns A promise that resolves with a connection object
     */
    public async getConnection(
        providerConfigKey: string,
        connectionId: string,
        forceRefresh?: boolean,
        refreshToken?: boolean
    ): Promise<GetPublicConnection['Success']> {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh, refreshToken);
        return response.data;
    }

    /**
     * @deprecated This method has been deprecated, please use the REST API to import a connection.
     */
    public importConnection(_connectionArgs: CreateConnectionOAuth1 | (CreateConnectionOAuth2 & { metadata: string; connection_config: string })) {
        throw new Error('This method has been deprecated, please use the REST API to import a connection.');
    }

    /**
     * @deprecated This method has been deprecated, please use the REST API to import a connection.
     */
    public createConnection(_connectionArgs: CreateConnectionOAuth1 | (CreateConnectionOAuth2 & { metadata: string; connection_config: string })) {
        throw new Error('This method has been deprecated, please use the REST API to create a connection.');
    }

    /**
     * For OAuth 2: returns the access token directly as a string
     * For OAuth 2: If you want to obtain a new refresh token from the provider before the current token has expired,
     * you can set the forceRefresh argument to true
     * For OAuth 1: returns an object with 'oAuthToken' and 'oAuthTokenSecret' fields
     * @param providerConfigKey - The integration ID used to create the connection (i.e Unique Key)
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param forceRefresh - Optional. When set to true, this obtains a new access token from the provider before the current token has expired
     */
    public async getToken(
        providerConfigKey: string,
        connectionId: string,
        forceRefresh?: boolean
    ): Promise<
        | string
        | OAuth1Token
        | BasicApiCredentials
        | ApiKeyCredentials
        | AppCredentials
        | OAuth2ClientCredentials
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
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);

        switch (response.data.credentials.type) {
            case 'OAUTH2':
                return response.data.credentials.access_token;
            case 'OAUTH1':
                return { oAuthToken: response.data.credentials.oauth_token, oAuthTokenSecret: response.data.credentials.oauth_token_secret };
            default:
                return response.data.credentials;
        }
    }

    /**
     * Get the full (fresh) credentials payload returned by the external API,
     * which also contains access credentials
     * @param providerConfigKey - The integration ID used to create the connection (i.e Unique Key)
     * @param connectionId - This is the unique connection identifier used to identify this connection
     * @param forceRefresh - Optional. When set to true, this obtains a new access token from the provider before the current token has expired
     * @returns A promise that resolves with the raw token response
     */
    public async getRawTokenResponse<T = Record<string, any>>(providerConfigKey: string, connectionId: string, forceRefresh?: boolean): Promise<T> {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);
        const credentials = response.data.credentials as CredentialsCommon;
        return credentials.raw as T;
    }

    /**
     * Retrieves metadata for a given provider configuration key and connection ID
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID of the connection for which to retrieve metadata
     * @returns A promise that resolves with the retrieved metadata
     */
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

    /**
     * Sets custom metadata for a connection
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID(s) of the connection(s) for which to set metadata
     * @param metadata - The custom metadata to set
     * @returns A promise that resolves with the Axios response from the server
     */
    public async setMetadata(providerConfigKey: string, connectionId: string | string[], metadata: Metadata): Promise<AxiosResponse<MetadataChangeResponse>> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!connectionId) {
            throw new Error('Connection Id is required');
        }

        if (!metadata) {
            throw new Error('Metadata is required');
        }

        const url = `${this.serverUrl}/connection/metadata`;

        return this.http.post(url, { metadata, connection_id: connectionId, provider_config_key: providerConfigKey }, { headers: this.enrichHeaders() });
    }

    /**
     * Edits custom metadata for a connection, only overriding specified properties, not the entire metadata
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID(s) of the connection(s) for which to update metadata
     * @param metadata - The custom metadata to update
     * @returns A promise that resolves with the Axios response from the server
     */
    public async updateMetadata(
        providerConfigKey: string,
        connectionId: string | string[],
        metadata: Metadata
    ): Promise<AxiosResponse<MetadataChangeResponse>> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!connectionId) {
            throw new Error('Connection Id is required');
        }

        if (!metadata) {
            throw new Error('Metadata is required');
        }

        const url = `${this.serverUrl}/connection/metadata`;

        return this.http.patch(url, { metadata, connection_id: connectionId, provider_config_key: providerConfigKey }, { headers: this.enrichHeaders() });
    }

    /**
     * Deletes a specific connection
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID of the connection to be deleted
     * @returns A promise that resolves with the Axios response from the server
     */
    public async deleteConnection(providerConfigKey: string, connectionId: string): Promise<AxiosResponse<void>> {
        const url = `${this.serverUrl}/connection/${connectionId}?provider_config_key=${providerConfigKey}`;

        const headers = {
            'Content-Type': 'application/json'
        };

        return this.http.delete(url, { headers: this.enrichHeaders(headers) });
    }

    /**
     * =======
     * SCRIPTS
     *      CONFIG
     * =======
     */

    /**
     * Retrieves the configuration for all integration scripts
     * @returns A promise that resolves with an array of configuration objects for all integration scripts
     */
    public async getScriptsConfig(): Promise<StandardNangoConfig[]> {
        const url = `${this.serverUrl}/scripts/config`;

        const headers = {
            'Content-Type': 'application/json'
        };

        const response = await this.http.get(url, { headers: this.enrichHeaders(headers) });

        return response.data;
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

    /**
     * Returns the synced data, ordered by modification date ascending
     * If some records are updated while you paginate through this endpoint, you might see these records multiple times
     * @param config - Configuration object for listing records
     * @returns A promise that resolves with an object containing an array of records and a cursor for pagination
     */
    public async listRecords<T extends Record<string, any> = Record<string, any>>(
        config: ListRecordsRequestConfig
    ): Promise<{ records: (T & { _nango_metadata: RecordMetadata })[]; next_cursor: string | null }> {
        const { connectionId, providerConfigKey, model, delta, modifiedAfter, limit, filter, cursor } = config;
        validateSyncRecordConfiguration(config);

        const url = `${this.serverUrl}/records/?model=${model}${delta || modifiedAfter ? `&modified_after=${modifiedAfter || delta}` : ''}${limit ? `&limit=${limit}` : ''}${
            filter ? `&filter=${filter}` : ''
        }${cursor ? `&cursor=${cursor}` : ''}`;

        const headers: Record<string, string | number | boolean> = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        const options = {
            headers: this.enrichHeaders(headers)
        };

        const response = await this.http.get(url, options);

        return response.data;
    }

    /**
     * Triggers an additional, one-off execution of specified sync(s) for a given connection or all applicable connections if no connection is specified
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param syncs - An optional array of sync names to trigger. If empty, all applicable syncs will be triggered
     * @param connectionId - An optional ID of the connection for which to trigger the syncs. If not provided, syncs will be triggered for all applicable connections
     * @param fullResync - An optional flag indicating whether to perform a full resynchronization. Default is false
     * @returns A promise that resolves when the sync trigger request is sent
     */
    public async triggerSync(providerConfigKey: string, syncs?: string[], connectionId?: string, fullResync?: boolean): Promise<void> {
        const url = `${this.serverUrl}/sync/trigger`;

        if (typeof syncs === 'string') {
            throw new Error('Syncs must be an array of strings. If it is a single sync, please wrap it in an array.');
        }

        const body = {
            syncs: syncs || [],
            provider_config_key: providerConfigKey,
            connection_id: connectionId,
            full_resync: fullResync
        };

        return this.http.post(url, body, { headers: this.enrichHeaders() });
    }

    /**
     * Starts the schedule of specified sync(s) for a given connection or all applicable connections if no connection is specified. Upon starting the schedule, the sync will execute immediately and then continue to run at the specified frequency. If the schedule was already started, this will have no effect.
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param syncs - An optional array of sync names to start. If empty, all applicable syncs will be started
     * @param connectionId - An optional ID of the connection for which to start the syncs. If not provided, syncs will be started for all applicable connections
     * @returns A promise that resolves when the sync start request is sent
     */
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

        return this.http.post(url, body, { headers: this.enrichHeaders() });
    }

    /**
     * Pauses the schedule of specified sync(s) for a given connection or all applicable connections
     * @param providerConfigKey -The key identifying the provider configuration on Nango
     * @param syncs - An optional array of sync names to pause. If empty, all applicable syncs will be paused
     * @param connectionId - An optional ID of the connection for which to pause the syncs. If not provided, syncs will be paused for all applicable connections
     * @returns A promise that resolves when the sync pause request is sent
     */
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

        return this.http.post(url, body, { headers: this.enrichHeaders() });
    }

    /**
     * Get the status of specified sync(s) for a given connection or all applicable connections
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param syncs - An array of sync names to get status for, or '*' to get status for all syncs
     * @param connectionId - An optional ID of the connection for which to get sync status. If not provided, status for all applicable connections will be retrieved
     * @returns A promise that resolves with the status of the specified sync(s)
     */
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

        const response = await this.http.get(url, { headers: this.enrichHeaders(), params });

        return response.data;
    }

    /**
     * Override a sync’s default frequency for a specific connection, or revert to the default frequency
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param sync - The name of the sync to update
     * @param connectionId - The ID of the connection for which to update the sync frequency
     * @param frequency - The new frequency to set for the sync, or null to revert to the default frequency
     * @returns A promise that resolves with the response data after updating the sync frequency
     */
    public async updateSyncConnectionFrequency(
        providerConfigKey: string,
        sync: string,
        connectionId: string,
        frequency: string | null
    ): Promise<UpdateSyncFrequencyResponse> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (typeof sync !== 'string') {
            throw new Error('Sync must be a string.');
        }

        if (typeof connectionId !== 'string') {
            throw new Error('ConnectionId must be a string.');
        }

        if (typeof frequency !== 'string' && frequency !== null) {
            throw new Error('Frequency must be a string or null.');
        }

        const url = `${this.serverUrl}/sync/update-connection-frequency`;

        const params = {
            sync,
            provider_config_key: providerConfigKey,
            connection_id: connectionId,
            frequency
        };

        const response = await this.http.put(url, { headers: this.enrichHeaders(), params });

        return response.data;
    }

    /**
     * Retrieve the environment variables as added in the Nango dashboard
     * @returns A promise that resolves with an array of environment variables
     */
    public async getEnvironmentVariables(): Promise<{ name: string; value: string }[]> {
        const url = `${this.serverUrl}/environment-variables`;

        const headers = {
            'Content-Type': 'application/json'
        };

        const response = await this.http.get(url, { headers: this.enrichHeaders(headers) });

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

    /**
     * Triggers an action for a connection
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID of the connection for which the action should be triggered
     * @param actionName - The name of the action to trigger
     * @param input - An optional input data for the action
     * @returns A promise that resolves with an object containing the response data from the triggered action
     */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    public async triggerAction<In = unknown, Out = object>(providerConfigKey: string, connectionId: string, actionName: string, input?: In): Promise<Out> {
        const url = `${this.serverUrl}/action/trigger`;

        const headers = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey
        };

        const body = {
            action_name: actionName,
            input
        };

        const response = await this.http.post(url, body, { headers: this.enrichHeaders(headers) });

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

    /**
     * Sends a proxied HTTP request based on the provided configuration
     * @param config - The configuration object for the proxy request
     * @returns A promise that resolves with the response from the proxied request
     */
    public async proxy<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        if (!config.connectionId && this.connectionId) {
            config.connectionId = this.connectionId;
        }

        if (!config.providerConfigKey && this.providerConfigKey) {
            config.providerConfigKey = this.providerConfigKey;
        }

        validateProxyConfiguration(config);

        const { providerConfigKey, connectionId, method, retries, headers: customHeaders, baseUrlOverride, decompress, retryOn } = config;

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

        if (customHeaders?.['Content-Type']) {
            headers['Content-Type'] = customHeaders['Content-Type'];
        }

        if (retries) {
            headers['Retries'] = retries;
        }

        if (decompress) {
            headers['Decompress'] = decompress;
        }

        if (retryOn) {
            headers['Retry-On'] = retryOn.join(',');
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

        if (method?.toUpperCase() === 'POST') {
            return this.http.post(url, config.data, options);
        } else if (method?.toUpperCase() === 'PATCH') {
            return this.http.patch(url, config.data, options);
        } else if (method?.toUpperCase() === 'PUT') {
            return this.http.put(url, config.data, options);
        } else if (method?.toUpperCase() === 'DELETE') {
            return this.http.delete(url, {
                ...options,
                ...(config.data ? { data: config.data } : {})
            });
        } else {
            return this.http.get(url, options);
        }
    }

    /**
     * Sends a GET request using the proxy based on the provided configuration
     * @param config - The configuration object for the GET request
     * @returns A promise that resolves with the response from the GET request
     */
    public async get<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'GET'
        });
    }

    /**
     * Sends a POST request using the proxy based on the provided configuration
     * @param config - The configuration object for the POST request
     * @returns A promise that resolves with the response from the POST request
     */
    public async post<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'POST'
        });
    }

    /**
     * Sends a PATCH request using the proxy based on the provided configuration
     * @param config - The configuration object for the PATCH request
     * @returns A promise that resolves with the response from the PATCH request
     */
    public async patch<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'PATCH'
        });
    }

    /**
     * Sends a DELETE request using the proxy based on the provided configuration
     * @param config - The configuration object for the DELETE request
     * @returns A promise that resolves with the response from the DELETE request
     */
    public async delete<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'DELETE'
        });
    }

    // -- Webhooks
    /**
     *
     * Verify incoming webhooks signature
     *
     * @param signatureInHeader - The value in the header X-Nango-Signature
     * @param jsonPayload - The HTTP body as JSON
     * @returns Whether the signature is valid
     */
    public verifyWebhookSignature(signatureInHeader: string, jsonPayload: unknown): boolean {
        return (
            crypto
                .createHash('sha256')
                .update(`${this.secretKey}${JSON.stringify(jsonPayload)}`)
                .digest('hex') === signatureInHeader
        );
    }

    /**
     * Creates a new connect session
     * @param sessionProps - The properties for the new session, including end user information
     * @returns A promise that resolves with the created session token and expiration date
     */
    public async createConnectSession(sessionProps: PostConnectSessions['Body']): Promise<PostConnectSessions['Success']> {
        const url = `${this.serverUrl}/connect/sessions`;

        const response = await this.http.post(url, sessionProps, { headers: this.enrichHeaders() });
        return response.data;
    }

    /**
     * Creates a new connect session dedicated for reconnecting
     * @param sessionProps - The properties for the new session, including end user information
     * @returns A promise that resolves with the created session token and expiration date
     */
    public async createReconnectSession(sessionProps: PostPublicConnectSessionsReconnect['Body']): Promise<PostPublicConnectSessionsReconnect['Success']> {
        const url = `${this.serverUrl}/connect/sessions/reconnect`;

        const response = await this.http.post(url, sessionProps, { headers: this.enrichHeaders() });
        return response.data;
    }

    /**
     * Retrieves details of a specific connection
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID of the connection for which to retrieve connection details
     * @param forceRefresh - An optional flag indicating whether to force a refresh of the access tokens. Defaults to false
     * @param refreshToken - An optional flag indicating whether to send the refresh token as part of the response. Defaults to false
     * @param additionalHeader - Optional. Additional headers to include in the request
     * @returns A promise that resolves with the response containing connection details
     */
    private async getConnectionDetails(
        providerConfigKey: string,
        connectionId: string,
        forceRefresh: boolean = false,
        refreshToken: boolean = false,
        additionalHeader: Record<string, any> = {}
    ): Promise<AxiosResponse<GetPublicConnection['Success']>> {
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

        return this.http.get(url, { params: params, headers: this.enrichHeaders(headers) });
    }

    /**
     * Enriches the headers with the Authorization token
     * @param headers - Optional. The headers to enrich
     * @returns The enriched headers
     */
    private enrichHeaders(headers: Record<string, string | number | boolean> = {}): Record<string, string | number | boolean> {
        headers['Authorization'] = 'Bearer ' + this.secretKey;

        return headers;
    }
}
