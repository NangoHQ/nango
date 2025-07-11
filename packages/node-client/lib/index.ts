import crypto from 'node:crypto';
import https from 'node:https';

import axios from 'axios';

import { addQueryParams, getUserAgent, validateProxyConfiguration, validateSyncRecordConfiguration } from './utils.js';

import type {
    ListRecordsRequestConfig,
    Metadata,
    MetadataChangeResponse,
    NangoProps,
    ProxyConfiguration,
    StandardNangoConfig,
    SyncStatusResponse,
    UpdateSyncFrequencyResponse
} from './types.js';
import type {
    ApiKeyCredentials,
    AppCredentials,
    AppStoreCredentials,
    BasicApiCredentials,
    BillCredentials,
    CredentialsCommon,
    CustomCredentials,
    DeleteSyncVariant,
    GetPublicConnection,
    GetPublicConnections,
    GetPublicIntegration,
    GetPublicListIntegrations,
    GetPublicListIntegrationsLegacy,
    GetPublicProvider,
    GetPublicProviders,
    JwtCredentials,
    NangoRecord,
    OAuth1Token,
    OAuth2ClientCredentials,
    OpenAIFunction,
    PatchPublicIntegration,
    PostConnectSessions,
    PostPublicConnectSessionsReconnect,
    PostPublicIntegration,
    PostPublicTrigger,
    PostSyncVariant,
    SignatureCredentials,
    TbaCredentials,
    TwoStepCredentials,
    UnauthCredentials
} from '@nangohq/types';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

export const prodHost = 'https://api.nango.dev';

export * from './types.js';
export { getUserAgent } from './utils.js';

type CustomHeaders = Record<string, string | number | boolean>;

const defaultHttpsAgent = new https.Agent({ keepAlive: true });

export interface AdminAxiosProps {
    userAgent?: string;
    interceptors?: {
        request?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
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

        if (interceptors?.request) {
            this.http.interceptors.request.use(interceptors.request);
        }
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

    public async getIntegration(
        params: GetPublicIntegration['Params'],
        queries?: GetPublicIntegration['Querystring']
    ): Promise<GetPublicIntegration['Success']> {
        const headers = { 'Content-Type': 'application/json' };

        const url = new URL(`${this.serverUrl}/integrations/${params.uniqueKey}`);
        addQueryParams(url, queries as GetPublicIntegration['Querystring']);

        const response = await this.http.get(url.href, { headers: this.enrichHeaders(headers) });
        return response.data;
    }

    public async createIntegration(body: PostPublicIntegration['Body']): Promise<PostPublicIntegration['Success']> {
        const url = `${this.serverUrl}/integrations`;
        const response = await this.http.post(url, body, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    public async updateIntegration(params: PatchPublicIntegration['Params'], body: PatchPublicIntegration['Body']): Promise<PatchPublicIntegration['Success']> {
        const url = `${this.serverUrl}/integrations/${params.uniqueKey}`;
        const response = await this.http.patch(url, body, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    /**
     * Deletes an integration with the specified configuration key
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @returns A promise that resolves with the response from the server
     */
    public async deleteIntegration(providerConfigKey: string): Promise<AxiosResponse<void>> {
        const url = `${this.serverUrl}/integrations/${providerConfigKey}`;
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
     * @param format The format to return the configuration in ('nango' | 'openai')
     * @returns A promise that resolves with an array of configuration objects for all integration scripts
     */
    public async getScriptsConfig(format: 'nango' | 'openai' = 'nango'): Promise<StandardNangoConfig[] | { data: OpenAIFunction[] }> {
        const url = `${this.serverUrl}/scripts/config`;

        const headers = {
            'Content-Type': 'application/json'
        };

        const response = await this.http.get(url, {
            headers: this.enrichHeaders(headers),
            params: {
                format
            }
        });

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
    ): Promise<{ records: NangoRecord<T>[]; next_cursor: string | null }> {
        const { connectionId, providerConfigKey, model, variant, delta, modifiedAfter, limit, filter, cursor } = config;
        validateSyncRecordConfiguration(config);
        const usp = new URLSearchParams({ model });
        if (variant) {
            usp.set('variant', variant);
        }
        if (modifiedAfter || delta) {
            usp.set('modified_after', `${modifiedAfter || delta}`);
        }
        if (limit) {
            usp.set('limit', String(limit));
        }
        if (filter) {
            usp.set('filter', filter);
        }
        if (cursor) {
            usp.set('cursor', cursor);
        }
        if (config.ids) {
            for (const id of config.ids) {
                usp.append('ids', id);
            }
        }

        const url = `${this.serverUrl}/records/?${usp.toString()}`;

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
     * @param syncs - An optional array of sync names or sync names/variants to trigger. If empty, all applicable syncs will be triggered
     * @param connectionId - An optional ID of the connection for which to trigger the syncs. If not provided, syncs will be triggered for all applicable connections
     * @param syncMode - An optional flag indicating whether to perform an incremental or full resync. Defaults to 'incremental`
     * @returns A promise that resolves when the sync trigger request is sent
     */
    public async triggerSync(
        providerConfigKey: string,
        syncs?: (string | { name: string; variant: string })[],
        connectionId?: string,
        syncMode?: PostPublicTrigger['Body']['sync_mode'] | boolean // boolean kept for backwards compatibility
    ): Promise<void> {
        const url = `${this.serverUrl}/sync/trigger`;

        if (syncs && !Array.isArray(syncs)) {
            throw new Error('Syncs must be an array. If it is a single sync, please wrap it in an array.');
        }

        if (typeof syncMode === 'boolean') {
            syncMode = syncMode ? 'full_refresh' : 'incremental';
        }

        syncMode ??= 'incremental';

        const body = {
            syncs: syncs || [],
            provider_config_key: providerConfigKey,
            connection_id: connectionId,
            sync_mode: syncMode
        };

        return this.http.post(url, body, { headers: this.enrichHeaders() });
    }

    /**
     * Starts the schedule of specified sync(s) for a given connection or all applicable connections if no connection is specified. Upon starting the schedule, the sync will execute immediately and then continue to run at the specified frequency. If the schedule was already started, this will have no effect.
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param syncs - An optional array of sync names or sync objects to start. If empty, all applicable syncs will be started
     * @param connectionId - An optional ID of the connection for which to start the syncs. If not provided, syncs will be started for all applicable connections
     * @returns A promise that resolves when the sync start request is sent
     */
    public async startSync(providerConfigKey: string, syncs: (string | { name: string; variant: string })[], connectionId?: string): Promise<void> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!syncs) {
            throw new Error('Sync is required');
        }

        if (!Array.isArray(syncs)) {
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
     * @param syncs - An optional array of sync names or sync objects to pause. If empty, all applicable syncs will be paused
     * @param connectionId - An optional ID of the connection for which to pause the syncs. If not provided, syncs will be paused for all applicable connections
     * @returns A promise that resolves when the sync pause request is sent
     */
    public async pauseSync(providerConfigKey: string, syncs: (string | { name: string; variant: string })[], connectionId?: string): Promise<void> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!syncs) {
            throw new Error('Sync is required');
        }

        if (!Array.isArray(syncs)) {
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
     * @param syncs - An array of sync names or sync objects to get status for, or '*' to get status for all syncs
     * @param connectionId - An optional ID of the connection for which to get sync status. If not provided, status for all applicable connections will be retrieved
     * @returns A promise that resolves with the status of the specified sync(s)
     */
    public async syncStatus(
        providerConfigKey: string,
        syncs: '*' | (string | { name: string; variant: string })[],
        connectionId?: string
    ): Promise<SyncStatusResponse> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!syncs) {
            throw new Error('Sync is required');
        }

        if (!Array.isArray(syncs) && syncs !== '*') {
            throw new Error('Syncs must be an array. If it is a single sync, please wrap it in an array.');
        }

        const url = `${this.serverUrl}/sync/status`;

        const getSyncFullName = (sync: string | { name: string; variant: string }) => {
            if (typeof sync === 'string') {
                return sync;
            }
            if (sync.variant) {
                return `${sync.name}::${sync.variant}`;
            }
            return sync.name;
        };

        const formattedSyncs = syncs === '*' ? '*' : syncs.map(getSyncFullName).join(',');

        const params = {
            syncs: formattedSyncs,
            provider_config_key: providerConfigKey,
            connection_id: connectionId
        };

        const response = await this.http.get(url, { headers: this.enrichHeaders(), params });

        return response.data;
    }

    /**
     * Override a sync's default frequency for a specific connection, or revert to the default frequency
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param sync - The name of the sync to update (or an object with name and variant properties)
     * @param connectionId - The ID of the connection for which to update the sync frequency
     * @param frequency - The new frequency to set for the sync, or null to revert to the default frequency
     * @returns A promise that resolves with the response data after updating the sync frequency
     */
    public async updateSyncConnectionFrequency(
        providerConfigKey: string,
        sync: string | { name: string; variant: string },
        connectionId: string,
        frequency: string | null
    ): Promise<UpdateSyncFrequencyResponse> {
        if (!providerConfigKey) {
            throw new Error('Provider Config Key is required');
        }

        if (!sync) {
            throw new Error('Sync is required');
        }

        if (typeof connectionId !== 'string') {
            throw new Error('ConnectionId must be a string.');
        }

        if (typeof frequency !== 'string' && frequency !== null) {
            throw new Error('Frequency must be a string or null.');
        }

        const url = `${this.serverUrl}/sync/update-connection-frequency`;

        const body = {
            ...(typeof sync === 'string' ? { sync_name: sync } : { sync_name: sync.name, sync_variant: sync.variant }),
            provider_config_key: providerConfigKey,
            connection_id: connectionId,
            frequency
        };

        const response = await this.http.put(url, body, { headers: this.enrichHeaders() });

        return response.data;
    }

    /**
     * Creates a new sync variant
     * @param props - The properties for the new variant (provider_config_key, connection_id, name, variant)
     * @returns A promise that resolves with the new sync variant (id, name, variant)
     */
    public async createSyncVariant(props: PostSyncVariant['Body'] & PostSyncVariant['Params']): Promise<PostSyncVariant['Success']> {
        const url = `${this.serverUrl}/sync/${props.name}/variant/${props.variant}`;
        const body = {
            provider_config_key: props.provider_config_key,
            connection_id: props.connection_id
        };
        const response = await this.http.post(url, body, { headers: this.enrichHeaders() });
        return response.data;
    }

    /**
     *
     * Delete an existing sync variant
     * @param props - The properties of the variant to delete (provider_config_key, connection_id, name, variant)
     * @returns A promise that resolves with void when the sync variant is deleted
     */
    public async deleteSyncVariant(props: DeleteSyncVariant['Body'] & DeleteSyncVariant['Params']): Promise<DeleteSyncVariant['Success']> {
        const url = `${this.serverUrl}/sync/${props.name}/variant/${props.variant}`;

        const response = await this.http.delete(url, {
            data: {
                provider_config_key: props.provider_config_key,
                connection_id: props.connection_id
            },
            headers: this.enrichHeaders()
        });
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

    private async _triggerAction<In = unknown, Out = object>(
        providerConfigKey: string,
        connectionId: string,
        actionName: string,
        async: boolean,
        input?: In
    ): Promise<Out> {
        const url = `${this.serverUrl}/action/trigger`;

        const headers = {
            'Connection-Id': connectionId,
            'Provider-Config-Key': providerConfigKey,
            ...(async ? { 'X-Async': 'true' } : {})
        };

        const body = {
            action_name: actionName,
            input
        };

        const response = await this.http.post(url, body, { headers: this.enrichHeaders(headers) });

        return response.data;
    }

    /**
     * Triggers an action for a connection
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID of the connection for which the action should be triggered
     * @param actionName - The name of the action to trigger
     * @param input - An optional input data for the action
     * @returns A promise that resolves with an object containing the response data from the triggered action
     */

    public async triggerAction<In = unknown, Out = object>(providerConfigKey: string, connectionId: string, actionName: string, input?: In): Promise<Out> {
        return this._triggerAction<In, Out>(providerConfigKey, connectionId, actionName, false, input);
    }

    /**
     * Triggers an action asynchronously for a connection
     * @param providerConfigKey - The key identifying the provider configuration on Nango
     * @param connectionId - The ID of the connection for which the action should be triggered
     * @param actionName - The name of the action to trigger
     * @param input - An optional input data for the action
     * @returns A promise that resolves with the ID of the action and the URL where the result can be retrieved
     */
    public async triggerActionAsync<In = unknown>(
        providerConfigKey: string,
        connectionId: string,
        actionName: string,
        input?: In
    ): Promise<{ id: string; statusUrl: string }> {
        return this._triggerAction<In, { id: string; statusUrl: string }>(providerConfigKey, connectionId, actionName, true, input);
    }

    /**
     * Retrieves the result of an asynchronous action
     * @param props - The properties of the action to retrieve the result for (id and/or statusUrl)
     * @returns A promise that resolves with the result of the action
     */
    public async getAsyncActionResult<Out = unknown>(props: Partial<Awaited<ReturnType<Nango['triggerActionAsync']>>>): Promise<Out> {
        if (!props.id && !props.statusUrl) {
            throw new Error('Either id or statusUrl must be provided');
        }
        const path = props.statusUrl ? props.statusUrl : `/action/${props.id}`;
        const url = `${this.serverUrl}${path}`;
        const response = await this.http.get(url, { headers: this.enrichHeaders() });
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

        let url = `${this.serverUrl}/proxy${config.endpoint[0] === '/' ? '' : '/'}${config.endpoint}`;

        const customPrefixedHeaders: CustomHeaders =
            customHeaders && Object.keys(customHeaders as CustomHeaders).length > 0
                ? Object.keys(customHeaders as CustomHeaders).reduce((acc: CustomHeaders, key: string) => {
                      acc[`Nango-Proxy-${key}`] = customHeaders[key] as string;
                      return acc;
                  }, {})
                : ({} as CustomHeaders);

        const headers: Record<string, string | number | boolean | CustomHeaders> = {
            'Connection-Id': connectionId!,
            'Provider-Config-Key': providerConfigKey!,
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
            if (typeof config.params === 'string') {
                if (url.includes('?')) {
                    throw new Error('Can not set query params in endpoint and in params');
                }
                url = new URL(`${url}${config.params.startsWith('?') ? config.params : `?${config.params}`}`).href;
            } else {
                const tmp = new URL(url);
                for (const [k, v] of Object.entries(config.params)) {
                    tmp.searchParams.set(k, v as string);
                }
                url = tmp.href;
            }
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
     * Sends a PUT request using the proxy based on the provided configuration
     * @param config - The configuration object for the PUT request
     * @returns A promise that resolves with the response from the PUT request
     */
    public async put<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'PUT'
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
