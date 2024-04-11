import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import axios from 'axios';

import type {
    ApiKeyCredentials,
    AppCredentials,
    BasicApiCredentials,
    Connection,
    ConnectionList,
    CredentialsCommon,
    GetRecordsRequestConfig,
    Integration,
    IntegrationWithCreds,
    ListRecordsRequestConfig,
    Metadata,
    OAuth1Credentials,
    OAuth2Credentials,
    ProxyConfiguration,
    StandardNangoConfig,
    SyncStatusResponse,
    UpdateSyncFrequencyResponse
} from './types.js';
import { AuthModes } from './types.js';
import { validateProxyConfiguration, validateSyncRecordConfiguration } from './utils.js';

export const stagingHost = 'https://api-staging.nango.dev';
export const prodHost = 'https://api.nango.dev';

export * from './types.js';

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

type CustomHeaders = Record<string, string | number | boolean>;

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
    modifiedAfter: string | null;
}

export type LastAction = 'ADDED' | 'UPDATED' | 'DELETED';

export interface RecordMetadata {
    first_seen_at: string;
    last_seen_at: string;
    last_action: LastAction;
    deleted_at: string | null;
    cursor: string;
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
     * Returns a list of integrations by sending a GET request
     * @returns {Promise<{ configs: Pick<Integration, 'unique_key' | 'provider'>[] }>} A promise that resolves with an object containing an array of integration configurations
     */
    public async listIntegrations(): Promise<{ configs: Pick<Integration, 'unique_key' | 'provider'>[] }> {
        const url = `${this.serverUrl}/config`;
        const response = await axios.get(url, { headers: this.enrichHeaders({}) });

        return response.data;
    }

    /**
     * Returns a specific integration by sending a GET request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {boolean} [includeIntegrationCredentials=false] - Whether to include integration credentials in the response. Default is false
     * @returns {Promise<{ config: Integration | IntegrationWithCreds }>} A promise that resolves with an object containing an integration configuration
     */
    public async getIntegration(
        providerConfigKey: string,
        includeIntegrationCredentials: boolean = false
    ): Promise<{ config: Integration | IntegrationWithCreds }> {
        const url = `${this.serverUrl}/config/${providerConfigKey}`;
        const response = await axios.get(url, { headers: this.enrichHeaders({}), params: { include_creds: includeIntegrationCredentials } });
        return response.data;
    }

    /**
     * Creates a new integration with the specified provider and configuration key by sending a POST request
     * Optionally, you can provide credentials for the integration
     * @param {string} provider - The provider of the integration
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {Record<string, string>} [credentials] - Optional credentials for the integration
     * @returns {Promise<{ config: Integration }>} A promise that resolves with the created integration configuration
     */
    public async createIntegration(provider: string, providerConfigKey: string, credentials?: Record<string, string>): Promise<{ config: Integration }> {
        const url = `${this.serverUrl}/config`;
        const response = await axios.post(url, { provider, provider_config_key: providerConfigKey, ...credentials }, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    /**
     * Updates an integration with the specified provider and configuration key by sending a PUT request
     * Only integrations using OAuth 1 & 2 can be updated, not integrations using API keys & Basic auth (because there is nothing to update for them)
     * @param {string} provider - The Nango API Configuration (cf. [providers.yaml](https://github.com/NangoHQ/nango/blob/master/packages/shared/providers.yaml))
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {Record<string, string>} [credentials] - Optional credentials to include, depending on the specific integration that you want to update
     * @returns {Promise<{ config: Integration }>} A promise that resolves with the updated integration configuration object
     */
    public async updateIntegration(provider: string, providerConfigKey: string, credentials?: Record<string, string>): Promise<{ config: Integration }> {
        const url = `${this.serverUrl}/config`;
        const response = await axios.put(url, { provider, provider_config_key: providerConfigKey, ...credentials }, { headers: this.enrichHeaders({}) });
        return response.data;
    }

    /**
     * Deletes an integration with the specified configuration key by sending a DELETE request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @returns {Promise<AxiosResponse<void>>} A promise that resolves with the response from the server
     */
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
     * Returns a list of connections by sending a GET request, optionally filtered by connection ID
     * @param {string} [connectionId] - Optional. The ID of the connection to retrieve details of
     * @returns {Promise<{ connections: ConnectionList[] }>} A promise that resolves with an array of connection objects
     */
    public async listConnections(connectionId?: string): Promise<{ connections: ConnectionList[] }> {
        const response = await this.listConnectionDetails(connectionId);
        return response.data;
    }
    /**
     * Returns a connection object, which also contains access credentials and full credentials payload
     * returned by the external API by sending a GET request
     * @param {string}providerConfigKey - The integration ID used to create the connection (aka Unique Key)
     * @param {string}connectionId - This is the unique connection identifier used to identify this connection
     * @param {boolean}[forceRefresh] - Optional. When set to true, this obtains a new access token from the provider before the current token has expired
     * @param {boolean}[refreshToken] - Optional. When set to true, this returns the refresh token as part of the response
     * @returns {Promise<Connection>} A promise that resolves with a connection object
     */
    public async getConnection(providerConfigKey: string, connectionId: string, forceRefresh?: boolean, refreshToken?: boolean): Promise<Connection> {
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
     * @param {string}providerConfigKey - The integration ID used to create the connection (aka Unique Key)
     * @param {string}connectionId - This is the unique connection identifier used to identify this connection
     * @param {boolean}[forceRefresh] - Optional. When set to true, this obtains a new access token from the provider before the current token has expired
     */
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
     * which also contains access credentials by sending a GET request
     * @param {string}providerConfigKey - The integration ID used to create the connection (aka Unique Key)
     * @param {string}connectionId - This is the unique connection identifier used to identify this connection
     * @param {boolean}[forceRefresh] - Optional. When set to true, this obtains a new access token from the provider before the current token has expired
     * @returns {Promise<T>} A promise that resolves with the raw token response
     * @template T - The type of the raw token response
     */
    public async getRawTokenResponse<T = Record<string, any>>(providerConfigKey: string, connectionId: string, forceRefresh?: boolean): Promise<T> {
        const response = await this.getConnectionDetails(providerConfigKey, connectionId, forceRefresh);
        const credentials = response.data.credentials as CredentialsCommon;
        return credentials.raw as T;
    }

    /**
     * Retrieves metadata for a given provider configuration key and connection ID by sending a GET request
     * @template T - The type of metadata to retrieve
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string} connectionId - The ID of the connection for which to retrieve metadata
     * @throws {Error} - If providerConfigKey or connectionId is missing
     * @returns {Promise<T>} - A promise that resolves with the retrieved metadata
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
     * Sets custom metadata for a connection by sending a POST request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string} connectionId - The ID of the connection for which to set metadata
     * @param {Record<string, any>} metadata - The custom metadata to set
     * @throws {Error} - If providerConfigKey, connectionId, or metadata is missing
     * @returns {Promise<AxiosResponse<void>>} - A promise that resolves with the Axios response from the server
     */
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
            'Provider-Config-Key': providerConfigKey
        };

        return axios.post(url, metadata, { headers: this.enrichHeaders(headers) });
    }

    /**
     * Edits custom metadata for a connection, only overriding specified properties, not the entire metadata by sending a PATCH request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string} connectionId - The ID of the connection for which to update metadata
     * @param {Record<string, any>} metadata - The custom metadata to update
     * @returns {Promise<AxiosResponse<void>>} - A promise that resolves with the Axios response from the server
     * @throws {Error} - If providerConfigKey, connectionId, or metadata is missing
     */
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
            'Provider-Config-Key': providerConfigKey
        };

        return axios.patch(url, metadata, { headers: this.enrichHeaders(headers) });
    }

    /**
     * Deletes a specific connection by sending a DELETE request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string} connectionId - The ID of the connection to be deleted
     * @returns {Promise<AxiosResponse<void>>} - A promise that resolves with the Axios response from the server
     */
    public async deleteConnection(providerConfigKey: string, connectionId: string): Promise<AxiosResponse<void>> {
        const url = `${this.serverUrl}/connection/${connectionId}?provider_config_key=${providerConfigKey}`;

        const headers = {
            'Content-Type': 'application/json'
        };

        return axios.delete(url, { headers: this.enrichHeaders(headers) });
    }

    /**
     * =======
     * SCRIPTS
     *      CONFIG
     * =======
     */

    /**
     * Retrieves the configuration for all integration scripts by sending a GET request
     * @returns {Promise<StandardNangoConfig[]>} - A promise that resolves with an array of configuration objects for all integration scripts
     */
    public async getScriptsConfig(): Promise<StandardNangoConfig[]> {
        const url = `${this.serverUrl}/scripts/config`;

        const headers = {
            'Content-Type': 'application/json'
        };

        const response = await axios.get(url, { headers: this.enrichHeaders(headers) });

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
     * @deprecated. Use listRecords() instead.
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

    /**
     * Returns the synced data by sending a GET request to list records, ordered by modification date ascending
     * If some records are updated while you paginate through this endpoint, you might see these records multiple times
     * @param {ListRecordsRequestConfig} config - Configuration object for listing records
     * @returns {Promise<{ records: (T & { _nango_metadata: RecordMetadata })[]; next_cursor: string | null }>} - A promise that resolves with an object containing an array of records and a cursor for pagination
     * @template T - The type of records to be listed
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

        const response = await axios.get(url, options);

        return response.data;
    }

    /**
     * Triggers an additional, one-off execution of specified sync(s) for a given connection or all applicable connections if no connection is specified by sending a POST request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string[]} [syncs=[]] - An optional array of sync names to trigger. If empty, all applicable syncs will be triggered
     * @param {string} [connectionId] - An optional ID of the connection for which to trigger the syncs. If not provided, syncs will be triggered for all applicable connections
     * @param {boolean} [fullResync] - An optional flag indicating whether to perform a full resynchronization. Default is false
     * @throws {Error} - If syncs is provided but not an empty array or array of strings, or if a string is provided instead of an array
     * @returns {Promise<void>} - A promise that resolves when the sync trigger request is sent
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

        return axios.post(url, body, { headers: this.enrichHeaders() });
    }

    /**
     * Starts the schedule of specified sync(s) for a given connection or all applicable connections if no connection is specified by sending a POST request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string[]} [syncs=[]] - An optional array of sync names to start. If empty, all applicable syncs will be started
     * @param {string} [connectionId] - An optional ID of the connection for which to start the syncs. If not provided, syncs will be started for all applicable connections
     * @throws {Error} - If providerConfigKey or syncs are not provided or syncs is provided but not an empty array or array of strings
     * @returns {Promise<void>} - A promise that resolves when the sync start request is sent
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

        return axios.post(url, body, { headers: this.enrichHeaders() });
    }

    /**
     * Pauses the schedule of specified sync(s) for a given connection or all applicable connections by sending a POST request
     * @param {string} providerConfigKey -The key identifying the provider configuration on Nango
     * @param {string[]} syncs - An optional array of sync names to pause. If empty, all applicable syncs will be paused
     * @param {string} [connectionId] - An optional ID of the connection for which to pause the syncs. If not provided, syncs will be paused for all applicable connections
     * @throws {Error} - If providerConfigKey or syncs are not provided or syncs is provided but not an empty array or array of strings
     * @returns {Promise<void>} - A promise that resolves when the sync pause request is sent
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

        return axios.post(url, body, { headers: this.enrichHeaders() });
    }

    /**
     * Get the status of specified sync(s) for a given connection or all applicable connections by sending a GET request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {'*' | string[]} syncs - An array of sync names to get status for, or '*' to get status for all syncs
     * @param {string} [connectionId] - An optional ID of the connection for which to get sync status. If not provided, status for all applicable connections will be retrieved
     * @throws {Error} - If providerConfigKey or sync are not provided or if syncs provided are not a string array or '*'
     * @returns {Promise<SyncStatusResponse>} - A promise that resolves with the status of the specified sync(s)
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

        const response = await axios.get(url, { headers: this.enrichHeaders(), params });

        return response.data;
    }

    /**
     * Override a sync’s default frequency for a specific connection, or revert to the default frequency by sending a PUT request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string} sync - The name of the sync to update
     * @param {string} connectionId - The ID of the connection for which to update the sync frequency
     * @param {string | null} frequency - The new frequency to set for the sync, or null to revert to the default frequency
     * @throws {Error} - If providerConfigKey, sync, or connectionId are not provided, or if frequency is not a string or null
     * @returns {Promise<UpdateSyncFrequencyResponse>} - A promise that resolves with the response data after updating the sync frequency
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

        if (typeof sync === 'string') {
            throw new Error('Sync must be a string.');
        }

        if (typeof connectionId === 'string') {
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

        const response = await axios.put(url, { headers: this.enrichHeaders(), params });

        return response.data;
    }

    /**
     * Retrieve the environment variables as added in the Nango dashboard by sending a GET request
     * @returns {Promise<{ name: string; value: string }[]>} - A promise that resolves with an array of environment variables
     */
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

    /**
     * Triggers an action for a connection by sending a POST request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string} connectionId - The ID of the connection for which the action should be triggered
     * @param {string} actionName - The name of the action to trigger
     * @param {unknown} [input] - An optional input data for the action
     * @returns {Promise<object>} - A promise that resolves with an object containing the response data from the triggered action
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

    /**
     * Sends a proxied HTTP request based on the provided configuration
     * @param {ProxyConfiguration} config - The configuration object for the proxy request
     * @returns {Promise<AxiosResponse<T>>} A promise that resolves with the response from the proxied request
     * @template T - The type of the response data
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

    /**
     * Sends a GET request using the proxy based on the provided configuration
     * @param {ProxyConfiguration} config - The configuration object for the GET request
     * @returns {Promise<AxiosResponse<T>>} A promise that resolves with the response from the GET request
     * @template T - The type of the response data
     */
    public async get<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'GET'
        });
    }

    /**
     * Sends a POST request using the proxy based on the provided configuration
     * @param {ProxyConfiguration} config - The configuration object for the POST request
     * @returns {Promise<AxiosResponse<T>>} A promise that resolves with the response from the POST request
     * @template T - The type of the response data
     */
    public async post<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'POST'
        });
    }

    /**
     * Sends a PATCH request using the proxy based on the provided configuration
     * @param {ProxyConfiguration} config - The configuration object for the PATCH request
     * @returns {Promise<AxiosResponse<T>>} A promise that resolves with the response from the PATCH request
     * @template T - The type of the response data
     */
    public async patch<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'PATCH'
        });
    }

    /**
     * Sends a DELETE request using the proxy based on the provided configuration
     * @param {ProxyConfiguration} config - The configuration object for the DELETE request
     * @returns {Promise<AxiosResponse<T>>} A promise that resolves with the response from the DELETE request
     * @template T - The type of the response data
     */
    public async delete<T = any>(config: ProxyConfiguration): Promise<AxiosResponse<T>> {
        return this.proxy({
            ...config,
            method: 'DELETE'
        });
    }

    /**
     * Retrieves details of a specific connection by sending a GET request
     * @param {string} providerConfigKey - The key identifying the provider configuration on Nango
     * @param {string} connectionId - The ID of the connection for which to retrieve connection details
     * @param {boolean} [forceRefresh=false] - An optional flag indicating whether to force a refresh of the access tokens. Defaults to false
     * @param {boolean} [refreshToken=false] - An optional flag indicating whether to send the refresh token as part of the response. Defaults to false
     * @param {Record<string, any>} [additionalHeader={}] - Additional headers to include in the request
     * @returns {Promise<AxiosResponse<Connection>>} A promise that resolves with the response containing connection details
     */
    private async getConnectionDetails(
        providerConfigKey: string,
        connectionId: string,
        forceRefresh: boolean = false,
        refreshToken: boolean = false,
        additionalHeader: Record<string, any> = {}
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

    /**
     * Retrieves details of all connections from the server or details of a specific connection if a connection ID is provided
     * @param {string} [connectionId] - Optional. This is the unique connection identifier used to identify this connection
     * @returns {Promise<AxiosResponse<{ connections: ConnectionList[] }>>} A promise that resolves with the response containing connection details
     */
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

    /**
     * Enriches the headers with the Authorization token
     * @param {Record<string, string | number | boolean>} [headers={}] - Optional. The headers to enrich
     * @returns {Record<string, string | number | boolean>} The enriched headers
     */
    private enrichHeaders(headers: Record<string, string | number | boolean> = {}): Record<string, string | number | boolean> {
        headers['Authorization'] = 'Bearer ' + this.secretKey;

        return headers;
    }
}
