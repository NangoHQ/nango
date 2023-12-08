import jwt from 'jsonwebtoken';
import axios from 'axios';
import db from '../db/database.js';
import analytics, { AnalyticsTypes } from '../utils/analytics.js';
import providerClientManager from '../clients/provider.client.js';
import type {
    TemplateOAuth2 as ProviderTemplateOAuth2,
    Template as ProviderTemplate,
    Config as ProviderConfig,
    AuthCredentials,
    OAuth1Credentials,
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

import type { Metadata, ConnectionConfig, Connection, StoredConnection, BaseConnection, NangoConnection } from '../models/Connection.js';
import type { ServiceResponse } from '../models/Generic.js';
import encryptionManager from '../utils/encryption.manager.js';
import metricsManager, { MetricTypes } from '../utils/metrics.manager.js';
import {
    AppCredentials,
    AuthModes as ProviderAuthModes,
    OAuth2Credentials,
    ImportedCredentials,
    ApiKeyCredentials,
    BasicApiCredentials
} from '../models/Auth.js';
import { schema } from '../db/database.js';
import { interpolateStringFromObject, parseTokenExpirationDate, isTokenExpired, getRedisUrl } from '../utils/utils.js';
import { connectionCreated as connectionCreatedHook } from '../hooks/hooks.js';
import { Locking } from '../utils/lock/locking.js';
import { InMemoryKVStore } from '../utils/kvstore/InMemoryStore.js';
import { RedisKVStore } from '../utils/kvstore/RedisStore.js';
import type { KVStore } from '../utils/kvstore/KVStore.js';

class ConnectionService {
    private locking: Locking;

    constructor(locking: Locking) {
        this.locking = locking;
    }

    public async upsertConnection(
        connectionId: string,
        providerConfigKey: string,
        provider: string,
        parsedRawCredentials: AuthCredentials,
        connectionConfig: Record<string, string>,
        environment_id: number,
        accountId: number,
        metadata?: Metadata
    ): Promise<{ id: number }[]> {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment_id);

        if (storedConnection) {
            const encryptedConnection = encryptionManager.encryptConnection({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: parsedRawCredentials,
                connection_config: connectionConfig,
                environment_id: environment_id,
                metadata: metadata || storedConnection.metadata || null
            });

            encryptedConnection.updated_at = new Date();

            await db.knex
                .withSchema(db.schema())
                .from<StoredConnection>(`_nango_connections`)
                .where({ id: storedConnection.id, deleted: false })
                .update(encryptedConnection);

            analytics.track(AnalyticsTypes.CONNECTION_UPDATED, accountId, { provider });

            return [{ id: storedConnection.id }];
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
                    environment_id: environment_id,
                    metadata: metadata || null
                }),
                ['id']
            );

        analytics.track(AnalyticsTypes.CONNECTION_INSERTED, accountId, { provider });

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
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment_id);

        if (storedConnection) {
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
                .where({ id: storedConnection.id, deleted: false })
                .update(encryptedConnection);

            analytics.track(AnalyticsTypes.API_CONNECTION_UPDATED, accountId, { provider });

            return [{ id: storedConnection.id }];
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

        analytics.track(AnalyticsTypes.API_CONNECTION_INSERTED, accountId, { provider });

        return id;
    }

    public async upsertUnauthConnection(connectionId: string, providerConfigKey: string, provider: string, environment_id: number, accountId: number) {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment_id);

        if (storedConnection) {
            await db.knex.withSchema(db.schema()).from<StoredConnection>(`_nango_connections`).where({ id: storedConnection.id, deleted: false }).update({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                updated_at: new Date()
            });

            analytics.track(AnalyticsTypes.UNAUTH_CONNECTION_UPDATED, accountId, { provider });

            return [{ id: storedConnection.id }];
        }
        const id = await db.knex.withSchema(db.schema()).from<StoredConnection>(`_nango_connections`).insert(
            {
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: {},
                connection_config: {},
                environment_id
            },
            ['id']
        );

        analytics.track(AnalyticsTypes.UNAUTH_CONNECTION_INSERTED, accountId, { provider });

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
            connection_config || {},
            environmentId,
            accountId,
            metadata || undefined
        );

        if (importedConnection) {
            await connectionCreatedHook(
                {
                    id: importedConnection[0]?.id as number,
                    connection_id,
                    provider_config_key,
                    environment_id: environmentId
                },
                provider
            );
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
            await connectionCreatedHook(
                {
                    id: importedConnection[0].id,
                    connection_id,
                    provider_config_key,
                    environment_id: environmentId
                },
                provider
            );
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

    public async checkIfConnectionExists(
        connection_id: string,
        provider_config_key: string,
        environment_id: number
    ): Promise<null | { id: number; metadata: Metadata }> {
        const result = await schema().select('id', 'metadata').from<StoredConnection>('_nango_connections').where({
            connection_id,
            provider_config_key,
            environment_id,
            deleted: false
        });

        if (!result || result.length == 0 || !result[0]) {
            return null;
        }

        return result[0];
    }

    public async getConnection(connectionId: string, providerConfigKey: string, environment_id: number): Promise<ServiceResponse<Connection>> {
        if (!environment_id) {
            const error = new NangoError('missing_environment');

            return { success: false, error, response: null };
        }

        if (!connectionId) {
            const error = new NangoError('missing_connection');

            await metricsManager.capture(MetricTypes.GET_CONNECTION_FAILURE, error.message, LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey
            });

            return { success: false, error, response: null };
        }

        if (!providerConfigKey) {
            const error = new NangoError('missing_provider_config');

            await metricsManager.capture(MetricTypes.GET_CONNECTION_FAILURE, error.message, LogActionEnum.AUTH, {
                environmentId: String(environment_id),
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

            await metricsManager.capture(MetricTypes.GET_CONNECTION_FAILURE, error.message, LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey
            });

            return { success: false, error, response: null };
        }

        const connection = encryptionManager.decryptConnection(storedConnection);

        // Parse the token expiration date.
        if (connection != null) {
            const credentials = connection.credentials as OAuth1Credentials | OAuth2Credentials | AppCredentials;
            if (credentials.type && credentials.type === ProviderAuthModes.OAuth2) {
                const creds = credentials as OAuth2Credentials;
                creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
                connection.credentials = creds;
            }

            if (credentials.type && credentials.type === ProviderAuthModes.App) {
                const creds = credentials as AppCredentials;
                creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
                connection.credentials = creds;
            }
        }

        await this.updateLastFetched(connection?.id as number);

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

    public async getConnectionConfig(connection: Connection): Promise<ConnectionConfig> {
        const result = await db.knex.withSchema(db.schema()).from<StoredConnection>(`_nango_connections`).select('connection_config').where({
            connection_id: connection.connection_id,
            provider_config_key: connection.provider_config_key,
            environment_id: connection.environment_id,
            deleted: false
        });

        if (!result || result.length == 0 || !result[0]) {
            return {};
        }

        return result[0].connection_config;
    }

    public async getConnectionsByEnvironmentAndConfig(environment_id: number, providerConfigKey: string): Promise<NangoConnection[]> {
        const result = await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .select('id', 'connection_id', 'provider_config_key', 'environment_id', 'connection_config')
            .where({ environment_id, provider_config_key: providerConfigKey, deleted: false });

        if (!result || result.length == 0 || !result[0]) {
            return [];
        }

        return result;
    }

    public async replaceMetadata(connection: Connection, metadata: Metadata) {
        await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .where({ id: connection.id as number, deleted: false })
            .update({ metadata });
    }

    public async replaceConnectionConfig(connection: Connection, config: ConnectionConfig) {
        await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .where({ id: connection.id as number, deleted: false })
            .update({ connection_config: config });
    }

    public async updateMetadata(connection: Connection, metadata: Metadata): Promise<Metadata> {
        const existingMetadata = await this.getMetadata(connection);
        const newMetadata = { ...existingMetadata, ...metadata };
        await this.replaceMetadata(connection, newMetadata);

        return newMetadata;
    }

    public async updateConnectionConfig(connection: Connection, config: ConnectionConfig): Promise<ConnectionConfig> {
        const existingConfig = await this.getConnectionConfig(connection);
        const newConfig = { ...existingConfig, ...config };
        await this.replaceConnectionConfig(connection, newConfig);

        return newConfig;
    }

    public async findConnectionByConnectionConfigValue(key: string, value: string): Promise<Connection | null> {
        const result = await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .select('*')
            .whereRaw(`connection_config->>? = ? AND deleted = false`, [key, value]);

        if (!result || result.length == 0 || !result[0]) {
            return null;
        }

        return encryptionManager.decryptConnection(result[0]);
    }

    public async listConnections(
        environment_id: number,
        connectionId?: string
    ): Promise<{ id: number; connection_id: string; provider: string; created: string; metadata: Metadata }[]> {
        const queryBuilder = db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .select({ id: 'id' }, { connection_id: 'connection_id' }, { provider: 'provider_config_key' }, { created: 'created_at' }, 'metadata')
            .where({ environment_id, deleted: false });
        if (connectionId) {
            queryBuilder.where({ connection_id: connectionId });
        }
        return queryBuilder;
    }

    public async deleteConnection(connection: Connection, providerConfigKey: string, environment_id: number): Promise<number> {
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
                    environment_id: environmentId,
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
                    environment_id: environmentId,
                    activity_log_id: activityLogId,
                    content: `Configuration not found using the providerConfigKey: ${providerConfigKey}, the account id: ${accountId} and the environment: ${environmentId}`,
                    timestamp: Date.now()
                });
            }

            const error = new NangoError('unknown_provider_config');
            return { success: false, error, response: null };
        }

        const template: ProviderTemplate | undefined = configService.getTemplate(config?.provider as string);

        if (connection?.credentials?.type === ProviderAuthModes.OAuth2 || connection?.credentials?.type === ProviderAuthModes.App) {
            const {
                success,
                error,
                response: credentials
            } = await this.refreshCredentialsIfNeeded(
                connection as Connection,
                config as ProviderConfig,
                template as ProviderTemplateOAuth2,
                activityLogId,
                environmentId,
                instantRefresh,
                action
            );

            if (!success) {
                return { success, error, response: null };
            }

            connection.credentials = credentials as OAuth2Credentials;
        }

        return { success: true, error: null, response: connection };
    }

    public async updateLastFetched(id: number) {
        await db.knex.withSchema(db.schema()).from<Connection>(`_nango_connections`).where({ id, deleted: false }).update({ last_fetched_at: new Date() });
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

    public async refreshCredentialsIfNeeded(
        connection: Connection,
        providerConfig: ProviderConfig,
        template: ProviderTemplateOAuth2,
        activityLogId: number | null = null,
        environment_id: number,
        instantRefresh = false,
        logAction: LogAction = 'token'
    ): Promise<ServiceResponse<OAuth2Credentials | AppCredentials>> {
        const connectionId = connection.connection_id;
        const credentials = connection.credentials as OAuth2Credentials;
        const providerConfigKey = connection.provider_config_key;

        const shouldRefresh = await this.shouldRefreshCredentials(connection, credentials, providerConfig, template, instantRefresh);

        if (shouldRefresh) {
            await metricsManager.capture(MetricTypes.AUTH_TOKEN_REFRESH_START, 'Token refresh is being started', LogActionEnum.AUTH, {
                environmentId: String(environment_id),
                connectionId,
                providerConfigKey,
                provider: providerConfig.provider
            });
            // We must ensure that only one refresh is running at a time accross all instances.
            // Using a simple redis entry as a lock with a TTL to ensure it is always released.
            // NOTES:
            // - This is not a distributed lock and will not work in a multi-redis environment.
            // - It could also be unsafe in case of a Redis crash.
            // We are using this for now as it is a simple solution that should work for most cases.
            const lockKey = `lock:refresh:${environment_id}:${providerConfigKey}:${connectionId}`;
            try {
                const ttlInMs = 10000;
                const acquitistionTimeoutMs = ttlInMs * 1.2; // giving some extra time for the lock to be released
                await this.locking.tryAcquire(lockKey, ttlInMs, acquitistionTimeoutMs);

                const { success, error, response: newCredentials } = await this.getNewCredentials(connection, providerConfig, template);
                if (!success || !newCredentials) {
                    await metricsManager.capture(MetricTypes.AUTH_TOKEN_REFRESH_FAILURE, `Token refresh failed, ${error?.message}`, LogActionEnum.AUTH, {
                        environmentId: String(environment_id),
                        connectionId,
                        providerConfigKey,
                        provider: providerConfig.provider
                    });

                    return { success, error, response: null };
                }
                connection.credentials = newCredentials;
                await this.updateConnection(connection);

                if (activityLogId && logAction === 'token') {
                    await this.logActivity(activityLogId, environment_id, `Token was refreshed for ${providerConfigKey} and connection ${connectionId}`);
                }

                await metricsManager.capture(MetricTypes.AUTH_TOKEN_REFRESH_SUCCESS, 'Token refresh was successful', LogActionEnum.AUTH, {
                    environmentId: String(environment_id),
                    connectionId,
                    providerConfigKey,
                    provider: providerConfig.provider
                });

                return { success: true, error: null, response: newCredentials };
            } catch (e: any) {
                if (activityLogId && logAction === 'token') {
                    await this.logErrorActivity(activityLogId, environment_id, `Refresh oauth2 token call failed`);
                }

                const errorMessage = e.message || 'Unknown error';
                const errorDetails = {
                    message: errorMessage,
                    name: e.name || 'Error',
                    stack: e.stack || 'No stack trace'
                };

                const errorString = JSON.stringify(errorDetails);

                await metricsManager.capture(MetricTypes.AUTH_TOKEN_REFRESH_FAILURE, `Token refresh failed, ${errorString}`, LogActionEnum.AUTH, {
                    environmentId: String(environment_id),
                    connectionId,
                    providerConfigKey,
                    provider: providerConfig.provider
                });

                const error = new NangoError('refresh_token_external_error', e as Error);

                return { success: false, error, response: null };
            } finally {
                this.locking.release(lockKey);
            }
        }

        return { success: true, error: null, response: credentials };
    }

    public async getAppCredentials(
        template: ProviderTemplate,
        config: ProviderConfig,
        connectionConfig: Connection['connection_config']
    ): Promise<ServiceResponse<AppCredentials>> {
        const tokenUrl = interpolateStringFromObject(template.token_url, { connectionConfig });
        const privateKeyBase64 = config.oauth_client_secret;

        let privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
        privateKey = privateKey.replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n');
        privateKey = privateKey.replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----');
        privateKey = privateKey.replace(/(.{64})/g, '$1\n');

        const now = Math.floor(Date.now() / 1000);
        const expiration = now + 10 * 60;

        const payload = {
            iat: now,
            exp: expiration,
            iss: config.oauth_client_id
        };

        const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

        try {
            const tokenResponse = await axios.post(
                tokenUrl,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github.v3+json'
                    }
                }
            );

            const rawCredentials = tokenResponse.data;

            const credentials: AppCredentials = {
                type: ProviderAuthModes.App,
                access_token: (rawCredentials as any)?.token,
                expires_at: (rawCredentials as any)?.expires_at,
                raw: rawCredentials as unknown as Record<string, unknown>
            };

            return { success: true, error: null, response: credentials };
        } catch (e) {
            const errorMessage = JSON.stringify(e, ['message', 'name'], 2);
            const error = new NangoError('refresh_token_external_error', errorMessage);
            return { success: false, error, response: null };
        }
    }

    private async shouldRefreshCredentials(
        connection: Connection,
        credentials: OAuth2Credentials,
        providerConfig: ProviderConfig,
        template: ProviderTemplateOAuth2,
        instantRefresh: boolean
    ): Promise<boolean> {
        const refreshCondition =
            instantRefresh ||
            (providerClient.shouldIntrospectToken(providerConfig.provider) && (await providerClient.introspectedTokenExpired(providerConfig, connection)));

        let tokenExpirationCondition;

        if (template.auth_mode === ProviderAuthModes.OAuth2) {
            tokenExpirationCondition =
                credentials.refresh_token &&
                (refreshCondition || (credentials.expires_at && isTokenExpired(credentials.expires_at, template.token_expiration_buffer || 15 * 60)));
        } else if (template.auth_mode === ProviderAuthModes.App) {
            tokenExpirationCondition =
                refreshCondition || (credentials.expires_at && isTokenExpired(credentials.expires_at, template.token_expiration_buffer || 15 * 60));
        }

        return Boolean(tokenExpirationCondition);
    }

    private async getNewCredentials(
        connection: Connection,
        providerConfig: ProviderConfig,
        template: ProviderTemplate
    ): Promise<ServiceResponse<OAuth2Credentials | AppCredentials>> {
        if (providerClientManager.shouldUseProviderClient(providerConfig.provider)) {
            const rawCreds = await providerClientManager.refreshToken(template as ProviderTemplateOAuth2, providerConfig, connection);
            const parsedCreds = this.parseRawCredentials(rawCreds, ProviderAuthModes.OAuth2) as OAuth2Credentials;

            return { success: true, error: null, response: parsedCreds };
        } else if (template.auth_mode === ProviderAuthModes.App) {
            const { success, error, response: credentials } = await this.getAppCredentials(template, providerConfig, connection.connection_config);

            if (!success || !credentials) {
                return { success, error, response: null };
            }

            return { success: true, error: null, response: credentials };
        } else {
            const { success, error, response: creds } = await getFreshOAuth2Credentials(connection, providerConfig, template as ProviderTemplateOAuth2);

            return { success, error, response: success ? (creds as OAuth2Credentials) : null };
        }
    }

    private async logActivity(activityLogId: number, environment_id: number, message: string): Promise<void> {
        await updateActivityLogAction(activityLogId, 'token');
        await createActivityLogMessage({
            level: 'info',
            environment_id,
            activity_log_id: activityLogId,
            content: message,
            timestamp: Date.now()
        });
    }

    private async logErrorActivity(activityLogId: number, environment_id: number, message: string): Promise<void> {
        await updateActivityLogAction(activityLogId, 'token');
        await createActivityLogMessage({
            level: 'error',
            environment_id,
            activity_log_id: activityLogId,
            content: message,
            timestamp: Date.now()
        });
    }
}

const locking = await (async () => {
    let store: KVStore;
    const url = getRedisUrl();
    if (url) {
        store = new RedisKVStore(url);
        await (store as RedisKVStore).connect();
    } else {
        store = new InMemoryKVStore();
    }
    return new Locking(store);
})();

export default new ConnectionService(locking);
