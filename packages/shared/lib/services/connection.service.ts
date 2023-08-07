import db from '../db/database.js';
import analytics from '../utils/analytics.js';
import providerClientManager from '../clients/provider.client.js';
import type {
    TemplateOAuth2 as ProviderTemplateOAuth2,
    Template as ProviderTemplate,
    Config as ProviderConfig,
    AuthCredentials,
    OAuth1Credentials,
    CredentialsRefresh,
    LogAction
} from '../models/index.js';
import {
    updateAction as updateActivityLogAction,
    createActivityLogMessage,
    createActivityLogMessageAndEnd,
    updateProvider as updateProviderActivityLog
} from '../services/activity/activity.service.js';
import { LogActionEnum } from '../models/Activity.js';
import providerClient from '../clients/provider.client.js';
import configService from '../services/config.service.js';
import syncOrchestrator from './sync/orchestrator.service.js';
import environmentService from '../services/environment.service.js';
import { getFreshOAuth2Credentials } from '../clients/oauth2.client.js';
import { NangoError } from '../utils/error.js';

import type { Metadata, Connection, StoredConnection, BaseConnection, NangoConnection } from '../models/Connection.js';
import type { ServiceResponse } from '../models/Generic.js';
import encryptionManager from '../utils/encryption.manager.js';
import errorManager from '../utils/error.manager.js';
import { AuthModes as ProviderAuthModes, OAuth2Credentials, ImportedCredentials, ApiKeyCredentials, BasicApiCredentials } from '../models/Auth.js';
import { schema } from '../db/database.js';
import { parseTokenExpirationDate, isTokenExpired } from '../utils/utils.js';
import SyncClient from '../clients/sync.client.js';

class ConnectionService {
    private runningCredentialsRefreshes: CredentialsRefresh[] = [];

    public async upsertConnection(
        connectionId: string,
        providerConfigKey: string,
        provider: string,
        parsedRawCredentials: AuthCredentials,
        connectionConfig: Record<string, string>,
        environment_id: number,
        accountId: number
    ) {
        const storedConnectionId = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment_id);

        if (storedConnectionId) {
            const encryptedConnection = encryptionManager.encryptConnection({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: parsedRawCredentials,
                connection_config: connectionConfig,
                environment_id
            });
            encryptedConnection.updated_at = new Date();
            await db.knex
                .withSchema(db.schema())
                .from<StoredConnection>(`_nango_connections`)
                .where({ id: storedConnectionId, deleted: false })
                .update(encryptedConnection);

            analytics.track('server:connection_updated', accountId, { provider });

            return [{ id: storedConnectionId }];
        }

        const id = await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .insert(
                encryptionManager.encryptConnection({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    credentials: parsedRawCredentials,
                    connection_config: connectionConfig,
                    environment_id
                }),
                ['id']
            );

        analytics.track('server:connection_inserted', accountId, { provider });

        return id;
    }

    public async upsertApiConnection(
        connectionId: string,
        providerConfigKey: string,
        provider: string,
        credentials: ApiKeyCredentials | BasicApiCredentials,
        connectionConfig: Record<string, string>,
        environment_id: number,
        accountId: number
    ) {
        const storedConnectionId = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment_id);

        if (storedConnectionId) {
            const encryptedConnection = encryptionManager.encryptConnection({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials,
                connection_config: connectionConfig,
                environment_id
            });
            encryptedConnection.updated_at = new Date();
            await db.knex
                .withSchema(db.schema())
                .from<StoredConnection>(`_nango_connections`)
                .where({ id: storedConnectionId, deleted: false })
                .update(encryptedConnection);

            analytics.track('server:api_key_connection_updated', accountId, { provider });

            return [{ id: storedConnectionId }];
        }
        const id = await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .insert(
                encryptionManager.encryptApiConnection({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    credentials,
                    connection_config: connectionConfig,
                    environment_id
                }),
                ['id']
            );

        analytics.track('server:api_key_connection_inserted', accountId, { provider });

        return id;
    }

    public async importOAuthConnection(
        connection_id: string,
        provider_config_key: string,
        provider: string,
        environmentId: number,
        accountId: number,
        parsedRawCredentials: ImportedCredentials
    ) {
        const { connection_config, metadata } = parsedRawCredentials as Partial<Pick<BaseConnection, 'metadata' | 'connection_config'>>;

        const importedConnection = await this.upsertConnection(
            connection_id,
            provider_config_key,
            provider,
            parsedRawCredentials,
            { ...connection_config, ...metadata } as Record<string, string>,
            environmentId,
            accountId
        );

        if (importedConnection) {
            const syncClient = await SyncClient.getInstance();
            syncClient?.initiate(importedConnection[0].id);
        }

        return importedConnection;
    }

    public async importApiAuthConnection(
        connection_id: string,
        provider_config_key: string,
        provider: string,
        environmentId: number,
        accountId: number,
        credentials: BasicApiCredentials | ApiKeyCredentials
    ) {
        const connection = await this.checkIfConnectionExists(connection_id, provider_config_key, environmentId);

        if (connection) {
            throw new NangoError('connection_already_exists');
        }

        const importedConnection = await this.upsertApiConnection(connection_id, provider_config_key, provider, credentials, {}, environmentId, accountId);

        if (importedConnection) {
            const syncClient = await SyncClient.getInstance();
            syncClient?.initiate(importedConnection[0].id);
        }

        return importedConnection;
    }

    public async getConnectionById(
        id: number
    ): Promise<Pick<Connection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id' | 'connection_config' | 'metadata'> | null> {
        const result = await schema()
            .select('id', 'connection_id', 'provider_config_key', 'environment_id', 'connection_config', 'metadata')
            .from<StoredConnection>('_nango_connections')
            .where({ id: id, deleted: false });

        if (!result || result.length == 0 || !result[0]) {
            return null;
        }

        return result[0];
    }

    public async checkIfConnectionExists(connection_id: string, provider_config_key: string, environment_id: number): Promise<null | number> {
        const result = await schema().select('id').from<StoredConnection>('_nango_connections').where({
            connection_id,
            provider_config_key,
            environment_id,
            deleted: false
        });

        if (!result || result.length == 0 || !result[0]) {
            return null;
        }

        return result[0].id;
    }

    public async getConnection(connectionId: string, providerConfigKey: string, environment_id: number): Promise<ServiceResponse<Connection>> {
        if (!environment_id) {
            const error = new NangoError('missing_environment');

            return { success: false, error, response: null };
        }

        if (!connectionId) {
            const error = new NangoError('missing_connection');

            await errorManager.captureWithJustEnvironment('get_connection_failure', error.message, environment_id as number, LogActionEnum.AUTH, {
                connectionId,
                providerConfigKey
            });

            return { success: false, error, response: null };
        }

        if (!providerConfigKey) {
            const error = new NangoError('missing_provider_config');

            await errorManager.captureWithJustEnvironment('get_connection_failure', error.message, environment_id as number, LogActionEnum.AUTH, {
                connectionId,
                providerConfigKey
            });

            return { success: false, error, response: null };
        }

        const result: StoredConnection[] | null = (await schema()
            .select('*')
            .from<StoredConnection>(`_nango_connections`)
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey, environment_id, deleted: false })) as unknown as StoredConnection[];

        const storedConnection = result == null || result.length == 0 ? null : result[0] || null;

        if (!storedConnection) {
            const environmentName = await environmentService.getEnvironmentName(environment_id);

            const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName });

            await errorManager.captureWithJustEnvironment('get_connection_failure', error.message, environment_id as number, LogActionEnum.AUTH, {
                connectionId,
                providerConfigKey
            });

            return { success: false, error, response: null };
        }

        const connection = encryptionManager.decryptConnection(storedConnection);

        // Parse the token expiration date.
        if (connection != null) {
            const credentials = connection.credentials as OAuth1Credentials | OAuth2Credentials;
            if (credentials.type && credentials.type === ProviderAuthModes.OAuth2) {
                const creds = credentials as OAuth2Credentials;
                creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
                connection.credentials = creds;
            }
        }

        await this.updateLastFetched(connection?.id as number);

        const content = 'Connection fetched successfully';
        await errorManager.captureWithJustEnvironment('get_connection_success', content, environment_id as number, LogActionEnum.AUTH, {
            connectionId,
            providerConfigKey
        });

        return { success: true, error: null, response: connection };
    }

    public async updateConnection(connection: Connection) {
        await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .where({
                connection_id: connection.connection_id,
                provider_config_key: connection.provider_config_key,
                environment_id: connection.environment_id,
                deleted: false
            })
            .update(encryptionManager.encryptConnection(connection));
    }

    public async getMetadata(connection: Connection): Promise<Record<string, string>> {
        const result = await db.knex.withSchema(db.schema()).from<StoredConnection>(`_nango_connections`).select('metadata').where({
            connection_id: connection.connection_id,
            provider_config_key: connection.provider_config_key,
            environment_id: connection.environment_id,
            deleted: false
        });

        if (!result || result.length == 0 || !result[0]) {
            return {};
        }

        return result[0].metadata;
    }

    public async getConnectionsByEnvironmentAndConfig(environment_id: number, providerConfigKey: string): Promise<NangoConnection[]> {
        const result = await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .select('id', 'connection_id', 'provider_config_key', 'environment_id')
            .where({ environment_id, provider_config_key: providerConfigKey, deleted: false });

        if (!result || result.length == 0 || !result[0]) {
            return [];
        }

        return result;
    }

    public async updateMetadata(connection: Connection, metadata: Metadata) {
        await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .where({ id: connection.id as number, deleted: false })
            .update({ metadata });
    }

    async listConnections(environment_id: number, connectionId?: string): Promise<{ id: number; connection_id: number; provider: string; created: string }[]> {
        const queryBuilder = db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .select({ id: 'id' }, { connection_id: 'connection_id' }, { provider: 'provider_config_key' }, { created: 'created_at' })
            .where({ environment_id, deleted: false });
        if (connectionId) {
            queryBuilder.where({ connection_id: connectionId });
        }
        return queryBuilder;
    }

    async deleteConnection(connection: Connection, providerConfigKey: string, environment_id: number): Promise<number> {
        if (connection) {
            await syncOrchestrator.deleteSyncsByConnection(connection);
        }

        return await db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .where({
                connection_id: connection.connection_id,
                provider_config_key: providerConfigKey,
                environment_id,
                deleted: false
            })
            .update({ deleted: true, deleted_at: new Date() });
    }

    public async getConnectionCredentials(
        accountId: number,
        environmentId: number,
        connectionId: string,
        providerConfigKey: string,
        activityLogId?: number | null,
        action?: LogAction,
        instantRefresh = false
    ): Promise<ServiceResponse<Connection>> {
        if (connectionId === null) {
            const error = new NangoError('missing_connection');

            return { success: false, error, response: null };
        }

        if (providerConfigKey === null) {
            const error = new NangoError('missing_provider_config');

            return { success: false, error, response: null };
        }

        const { success, error, response: connection } = await this.getConnection(connectionId, providerConfigKey, environmentId);

        if (!success) {
            return { success, error, response: null };
        }

        if (connection === null) {
            if (activityLogId) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId,
                    content: `Connection not found using connectionId: ${connectionId} and providerConfigKey: ${providerConfigKey} and the environment: ${environmentId}`,
                    timestamp: Date.now()
                });
            }
            const environmentName = await environmentService.getEnvironmentName(environmentId);
            const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName });

            return { success: false, error, response: null };
        }

        const config: ProviderConfig | null = await configService.getProviderConfig(connection?.provider_config_key as string, environmentId);

        if (activityLogId) {
            await updateProviderActivityLog(activityLogId, config?.provider as string);
        }

        if (config === null) {
            if (activityLogId) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId,
                    content: `Configuration not found using the providerConfigKey: ${providerConfigKey}, the account id: ${accountId} and the environment: ${environmentId}`,
                    timestamp: Date.now()
                });
            }

            const error = new NangoError('unknown_provider_config');
            return { success: false, error, response: null };
        }

        const template: ProviderTemplate | undefined = configService.getTemplate(config?.provider as string);

        if (connection?.credentials?.type === ProviderAuthModes.OAuth2) {
            const {
                success,
                error,
                response: credentials
            } = await this.refreshOauth2CredentialsIfNeeded(
                connection as Connection,
                config as ProviderConfig,
                template as ProviderTemplateOAuth2,
                activityLogId,
                instantRefresh,
                action
            );

            if (!success) {
                return { success, error, response: null };
            }

            connection.credentials = credentials as OAuth2Credentials;
        }

        analytics.track('server:connection_fetched', accountId, { provider: config?.provider });

        return { success: true, error: null, response: connection };
    }

    public async updateLastFetched(connectionId: number) {
        await db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .where({ id: connectionId, deleted: false })
            .update({ last_fetched_at: new Date() });
    }

    // Parses and arbitrary object (e.g. a server response or a user provided auth object) into AuthCredentials.
    // Throws if values are missing/missing the input is malformed.
    public parseRawCredentials(rawCredentials: object, authMode: ProviderAuthModes): AuthCredentials {
        const rawCreds = rawCredentials as Record<string, any>;

        switch (authMode) {
            case ProviderAuthModes.OAuth2:
                if (!rawCreds['access_token']) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }

                let expiresAt: Date | undefined;

                if (rawCreds['expires_at']) {
                    expiresAt = parseTokenExpirationDate(rawCreds['expires_at']);
                } else if (rawCreds['expires_in']) {
                    expiresAt = new Date(Date.now() + Number.parseInt(rawCreds['expires_in'], 10) * 1000);
                }

                const oauth2Creds: OAuth2Credentials = {
                    type: ProviderAuthModes.OAuth2,
                    access_token: rawCreds['access_token'],
                    refresh_token: rawCreds['refresh_token'],
                    expires_at: expiresAt,
                    raw: rawCreds
                };

                return oauth2Creds;
            case ProviderAuthModes.OAuth1:
                if (!rawCreds['oauth_token'] || !rawCreds['oauth_token_secret']) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }

                const oauth1Creds: OAuth1Credentials = {
                    type: ProviderAuthModes.OAuth1,
                    oauth_token: rawCreds['oauth_token'],
                    oauth_token_secret: rawCreds['oauth_token_secret'],
                    raw: rawCreds
                };

                return oauth1Creds;

            default:
                throw new NangoError(`Cannot parse credentials, unknown credentials type: ${JSON.stringify(rawCreds, undefined, 2)}`);
        }
    }

    // Checks if the OAuth2 credentials need to be refreshed and refreshes them if neccessary.
    // If credentials get refreshed it also updates the user's connection object.
    // Once the refresh or check is complete the new/old credentials are returned, always use these moving forward
    public async refreshOauth2CredentialsIfNeeded(
        connection: Connection,
        providerConfig: ProviderConfig,
        template: ProviderTemplateOAuth2,
        activityLogId = null as number | null,
        instantRefresh = false,
        logAction: LogAction = 'token'
    ): Promise<ServiceResponse<OAuth2Credentials>> {
        const connectionId = connection.connection_id;
        const credentials = connection.credentials as OAuth2Credentials;
        const providerConfigKey = connection.provider_config_key;

        // Check if a refresh is already running for this user & provider configuration
        // If it is wait for that to complete
        let runningRefresh: CredentialsRefresh | undefined = undefined;
        for (const refresh of this.runningCredentialsRefreshes) {
            if (refresh.connectionId === connectionId && refresh.providerConfigKey === providerConfigKey) {
                runningRefresh = refresh;
            }
        }

        if (runningRefresh) {
            return runningRefresh.promise;
        }

        const refresh =
            instantRefresh ||
            (providerClient.shouldIntrospectToken(providerConfig.provider) && (await providerClient.introspectedTokenExpired(providerConfig, connection)));

        // If not expiration date is set, e.g. Github, we assume the token doesn't expire (unless introspection is enabled like Salesforce).
        if (
            credentials.refresh_token &&
            (refresh || (credentials.expires_at && isTokenExpired(credentials.expires_at, template.token_expiration_buffer || 15 * 60)))
        ) {
            const promise = new Promise<ServiceResponse<OAuth2Credentials>>((resolve, reject) => {
                (async () => {
                    try {
                        let newCredentials: OAuth2Credentials;

                        if (providerClientManager.shouldUseProviderClient(providerConfig.provider)) {
                            const rawCreds = await providerClientManager.refreshToken(template, providerConfig, connection);
                            newCredentials = this.parseRawCredentials(rawCreds, ProviderAuthModes.OAuth2) as OAuth2Credentials;
                        } else {
                            const {
                                success,
                                error,
                                response: creds
                            } = await getFreshOAuth2Credentials(connection, providerConfig, template as ProviderTemplateOAuth2);

                            if (!success) {
                                return resolve({ success, error, response: null });
                            }

                            newCredentials = creds as OAuth2Credentials;
                        }

                        connection.credentials = newCredentials;

                        await this.updateConnection(connection);

                        // Remove ourselves from the array of running refreshes
                        this.runningCredentialsRefreshes = this.runningCredentialsRefreshes.filter((value) => {
                            return !(value.providerConfigKey === providerConfigKey && value.connectionId === connectionId);
                        });

                        resolve({ success: true, error: null, response: newCredentials });
                    } catch (e) {
                        // Remove ourselves from the array of running refreshes
                        this.runningCredentialsRefreshes = this.runningCredentialsRefreshes.filter((value) => {
                            return !(value.providerConfigKey === providerConfigKey && value.connectionId === connectionId);
                        });

                        if (activityLogId && logAction === 'token') {
                            await updateActivityLogAction(activityLogId as unknown as number, 'token');

                            await createActivityLogMessage({
                                level: 'error',
                                activity_log_id: activityLogId as number,
                                content: `Refresh oauth2 token call failed`,
                                timestamp: Date.now()
                            });
                        }
                        reject(e);
                    }
                })();
            });

            const refresh = {
                connectionId: connectionId,
                providerConfigKey: providerConfigKey,
                promise: promise
            } as CredentialsRefresh;

            if (activityLogId && logAction === 'token') {
                await updateActivityLogAction(activityLogId as unknown as number, 'token');

                await createActivityLogMessage({
                    level: 'info',
                    activity_log_id: activityLogId as number,
                    content: `Token was refreshed for ${providerConfigKey} and connection ${connectionId}`,
                    timestamp: Date.now()
                });
            }
            this.runningCredentialsRefreshes.push(refresh);

            return promise;
        }

        // All good, no refresh needed
        return { success: true, error: null, response: credentials };
    }
}

export default new ConnectionService();
