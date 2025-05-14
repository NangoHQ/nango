import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import ms from 'ms';
import { v4 as uuidv4 } from 'uuid';

import db, { dbNamespace } from '@nangohq/database';
import { Err, Ok, axiosInstance as axios, getLogger, stringifyError } from '@nangohq/utils';

import configService from './config.service.js';
import * as appleAppStoreClient from '../auth/appleAppStore.js';
import * as billClient from '../auth/bill.js';
import * as githubAppClient from '../auth/githubApp.js';
import * as jwtClient from '../auth/jwt.js';
import * as signatureClient from '../auth/signature.js';
import * as tableauClient from '../auth/tableau.js';
import { getFreshOAuth2Credentials } from '../clients/oauth2.client.js';
import providerClient from '../clients/provider.client.js';
import { DEFAULT_OAUTHCC_EXPIRES_AT_MS, MAX_CONSECUTIVE_DAYS_FAILED_REFRESH, getExpiresAtFromCredentials } from './connections/utils.js';
import syncManager from './sync/manager.service.js';
import encryptionManager from '../utils/encryption.manager.js';
import { NangoError } from '../utils/error.js';
import { loggedFetch } from '../utils/http.js';
import { productTracking } from '../utils/productTracking.js';
import {
    extractStepNumber,
    extractValueByPath,
    getStepResponse,
    interpolateObject,
    interpolateObjectValues,
    interpolateString,
    parseTokenExpirationDate,
    stripCredential,
    stripStepResponse
} from '../utils/utils.js';

import type { Orchestrator } from '../clients/orchestrator.js';
import type {
    ApiKeyCredentials,
    AppCredentials,
    AppStoreCredentials,
    BasicApiCredentials,
    ConnectionUpsertResponse,
    OAuth2ClientCredentials,
    OAuth2Credentials
} from '../models/Auth.js';
import type { ServiceResponse } from '../models/Generic.js';
import type { AuthCredentials, Config as ProviderConfig, OAuth1Credentials } from '../models/index.js';
import type { AuthCredentialsError } from '../utils/error.js';
import type { SlackService } from './notification/slack.service.js';
import type { Knex } from '@nangohq/database';
import type { LogContext, LogContextStateless } from '@nangohq/logs';
import type {
    AuthModeType,
    BillCredentials,
    ConnectionConfig,
    ConnectionInternal,
    DBConnection,
    DBConnectionAsJSONRow,
    DBConnectionDecrypted,
    DBEndUser,
    DBEnvironment,
    DBPlan,
    DBTeam,
    DBUser,
    JwtCredentials,
    MaybePromise,
    Metadata,
    Provider,
    ProviderAppleAppStore,
    ProviderBill,
    ProviderGithubApp,
    ProviderJwt,
    ProviderOAuth2,
    ProviderSignature,
    ProviderTableau,
    ProviderTwoStep,
    SignatureCredentials,
    TableauCredentials,
    TbaCredentials,
    TwoStepCredentials
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('Connection');
const ACTIVE_LOG_TABLE = dbNamespace + 'active_logs';

type KeyValuePairs = Record<string, string | boolean>;

class ConnectionService {
    public generateConnectionId(): string {
        return uuidv4();
    }

    public async upsertConnection({
        connectionId,
        providerConfigKey,
        parsedRawCredentials,
        connectionConfig,
        environmentId,
        metadata
    }: {
        connectionId: string;
        providerConfigKey: string;
        parsedRawCredentials: AuthCredentials;
        connectionConfig?: ConnectionConfig;
        environmentId: number;
        metadata?: Metadata | null;
    }): Promise<ConnectionUpsertResponse[]> {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environmentId);
        const config_id = await configService.getIdByProviderConfigKey(environmentId, providerConfigKey);

        if (storedConnection) {
            const encryptedConnection = encryptionManager.encryptConnection({
                ...storedConnection,
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: parsedRawCredentials,
                connection_config: connectionConfig || storedConnection.connection_config,
                environment_id: environmentId,
                config_id: config_id as number,
                metadata: metadata || storedConnection.metadata || null,
                credentials_expires_at: getExpiresAtFromCredentials(parsedRawCredentials),
                last_refresh_success: new Date(),
                last_refresh_failure: null,
                refresh_attempts: null,
                refresh_exhausted: false
            });

            const connection = await db.knex
                .from<DBConnection>(`_nango_connections`)
                .where({ id: storedConnection.id, deleted: false })
                .update(encryptedConnection)
                .returning('*');

            return [{ connection: connection[0]!, operation: 'override' }];
        }

        const { id, ...data } = encryptionManager.encryptConnection({
            connection_id: connectionId,
            provider_config_key: providerConfigKey,
            config_id: config_id as number,
            credentials: parsedRawCredentials,
            connection_config: connectionConfig || {},
            environment_id: environmentId,
            metadata: metadata || null,
            created_at: new Date(),
            updated_at: new Date(),
            id: -1,
            last_fetched_at: new Date(),
            credentials_expires_at: getExpiresAtFromCredentials(parsedRawCredentials),
            last_refresh_success: new Date(),
            last_refresh_failure: null,
            refresh_attempts: null,
            refresh_exhausted: false,
            deleted: false,
            deleted_at: null
        });
        const connection = await db.knex.from<DBConnection>(`_nango_connections`).insert(data).returning('*');

        return [{ connection: connection[0]!, operation: 'creation' }];
    }

    public async upsertAuthConnection({
        connectionId,
        providerConfigKey,
        credentials,
        connectionConfig,
        metadata,
        config,
        environment
    }: {
        connectionId: string;
        providerConfigKey: string;
        credentials:
            | TwoStepCredentials
            | TableauCredentials
            | TbaCredentials
            | JwtCredentials
            | ApiKeyCredentials
            | BasicApiCredentials
            | BillCredentials
            | SignatureCredentials;
        connectionConfig?: ConnectionConfig;
        config: ProviderConfig;
        metadata?: Metadata | null;
        environment: DBEnvironment;
    }): Promise<ConnectionUpsertResponse[]> {
        const { id, ...encryptedConnection } = encryptionManager.encryptConnection({
            connection_id: connectionId,
            provider_config_key: providerConfigKey,
            config_id: config.id as number,
            credentials,
            connection_config: connectionConfig || {},
            environment_id: environment.id,
            metadata: metadata || null,
            created_at: new Date(),
            updated_at: new Date(),
            id: -1,
            last_fetched_at: new Date(),
            credentials_expires_at: getExpiresAtFromCredentials(credentials),
            last_refresh_success: new Date(),
            last_refresh_failure: null,
            refresh_attempts: null,
            refresh_exhausted: false,
            deleted: false,
            deleted_at: null
        });

        const [connection] = await db.knex
            .from<DBConnection>(`_nango_connections`)
            .insert(encryptedConnection)
            .onConflict(['connection_id', 'provider_config_key', 'environment_id', 'deleted_at'])
            .merge({
                connection_id: encryptedConnection.connection_id,
                provider_config_key: encryptedConnection.provider_config_key,
                config_id: encryptedConnection.config_id,
                credentials: encryptedConnection.credentials,
                credentials_iv: encryptedConnection.credentials_iv,
                credentials_tag: encryptedConnection.credentials_tag,
                connection_config: encryptedConnection.connection_config,
                environment_id: encryptedConnection.environment_id,
                metadata: encryptedConnection.connection_config,
                credentials_expires_at: encryptedConnection.credentials_expires_at,
                last_refresh_success: encryptedConnection.last_refresh_success,
                last_refresh_failure: encryptedConnection.last_refresh_failure,
                refresh_attempts: encryptedConnection.refresh_attempts,
                refresh_exhausted: encryptedConnection.refresh_exhausted,
                updated_at: new Date()
            })
            .returning('*');

        const operation = connection ? 'creation' : 'override';

        return [{ connection: connection!, operation }];
    }

    public async upsertUnauthConnection({
        connectionId,
        providerConfigKey,
        metadata,
        connectionConfig,
        environment
    }: {
        connectionId: string;
        providerConfigKey: string;
        metadata?: Metadata | null;
        connectionConfig?: ConnectionConfig;
        environment: DBEnvironment;
    }): Promise<ConnectionUpsertResponse[]> {
        const storedConnection = await this.checkIfConnectionExists(connectionId, providerConfigKey, environment.id);
        const config_id = await configService.getIdByProviderConfigKey(environment.id, providerConfigKey); // TODO remove that
        const expiresAt = getExpiresAtFromCredentials({});

        if (storedConnection) {
            const connection = await db.knex
                .from<DBConnection>(`_nango_connections`)
                .where({ id: storedConnection.id, deleted: false })
                .update({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    config_id: config_id as number,
                    updated_at: new Date(),
                    connection_config: connectionConfig || storedConnection.connection_config,
                    metadata: metadata || storedConnection.metadata || null,
                    credentials_expires_at: expiresAt,
                    last_refresh_success: new Date(),
                    last_refresh_failure: null,
                    refresh_attempts: null,
                    refresh_exhausted: false
                })
                .returning('*');

            return [{ connection: connection[0]!, operation: 'override' }];
        }
        const connection = await db.knex
            .from<DBConnection>(`_nango_connections`)
            .insert({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: {},
                connection_config: connectionConfig || {},
                metadata: metadata || {},
                environment_id: environment.id,
                config_id: config_id!,
                credentials_expires_at: expiresAt,
                last_refresh_success: new Date(),
                last_refresh_failure: null,
                refresh_attempts: null,
                refresh_exhausted: false
            })
            .returning('*');

        return [{ connection: connection[0]!, operation: 'creation' }];
    }

    public async importOAuthConnection({
        connectionId,
        providerConfigKey,
        environment,
        metadata = null,
        connectionConfig = {},
        parsedRawCredentials,
        connectionCreatedHook
    }: {
        connectionId: string;
        providerConfigKey: string;
        environment: DBEnvironment;
        metadata?: Metadata | null;
        connectionConfig?: ConnectionConfig;
        parsedRawCredentials: OAuth2Credentials | OAuth1Credentials | OAuth2ClientCredentials;
        connectionCreatedHook: (res: ConnectionUpsertResponse) => MaybePromise<void>;
    }) {
        const [importedConnection] = await this.upsertConnection({
            connectionId,
            providerConfigKey,
            parsedRawCredentials,
            connectionConfig,
            environmentId: environment.id,
            metadata
        });

        if (importedConnection) {
            void connectionCreatedHook(importedConnection);
        }

        return [importedConnection];
    }

    public async importApiAuthConnection({
        connectionId,
        providerConfigKey,
        metadata = null,
        environment,
        connectionConfig = {},
        credentials,
        connectionCreatedHook
    }: {
        connectionId: string;
        providerConfigKey: string;
        provider: string;
        environment: DBEnvironment;
        metadata?: Metadata | null;
        connectionConfig?: ConnectionConfig;
        credentials: BasicApiCredentials | ApiKeyCredentials;
        connectionCreatedHook: (res: ConnectionUpsertResponse) => MaybePromise<void>;
    }) {
        const config = await configService.getProviderConfig(providerConfigKey, environment.id);

        if (!config) {
            logger.error('Unknown provider');
            return [];
        }

        const [importedConnection] = await this.upsertAuthConnection({
            connectionId,
            providerConfigKey,
            credentials,
            connectionConfig,
            metadata,
            config,
            environment
        });

        if (importedConnection) {
            void connectionCreatedHook(importedConnection);
        }

        return [importedConnection];
    }

    public async getConnectionById(id: number): Promise<DBConnection | null> {
        const result = await db.knex.from<DBConnection>('_nango_connections').select<DBConnection>('*').where({ id: id, deleted: false }).first();

        return result || null;
    }

    public async checkIfConnectionExists(connection_id: string, provider_config_key: string, environment_id: number): Promise<null | DBConnection> {
        const result = await db.knex
            .select<DBConnection>('*')
            .from<DBConnection>('_nango_connections')
            .where({
                connection_id,
                provider_config_key,
                environment_id,
                deleted: false
            })
            .first();

        return result || null;
    }

    public async getConnection(connectionId: string, providerConfigKey: string, environment_id: number): Promise<ServiceResponse<DBConnectionDecrypted>> {
        const rawConnection = await db.knex
            .from(`_nango_connections`)
            .select<DBConnection[]>('*')
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey, environment_id, deleted: false })
            .limit(1)
            .first();

        if (!rawConnection) {
            const error = new NangoError('unknown_connection', { connectionId, providerConfigKey });
            return { success: false, error, response: null };
        }

        const connection = encryptionManager.decryptConnection(rawConnection);

        // Parse the token expiration date.
        const credentials = connection.credentials;
        if (credentials.type && 'expires_at' in credentials) {
            const creds = credentials;
            creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
            connection.credentials = creds;
        }

        return { success: true, error: null, response: connection };
    }

    public async getConnectionForPrivateApi({
        connectionId,
        providerConfigKey,
        environmentId
    }: {
        connectionId: string;
        providerConfigKey: string;
        environmentId: number;
    }): Promise<Result<{ connection: DBConnectionDecrypted; end_user: DBEndUser }>> {
        const result = await db.knex
            .select<{
                connection: DBConnectionAsJSONRow;
                end_user: DBEndUser;
            }>(db.knex.raw('row_to_json(_nango_connections.*) as connection'), db.knex.raw('row_to_json(end_users.*) as end_user'))
            .from(`_nango_connections`)
            .leftJoin('end_users', 'end_users.id', '_nango_connections.end_user_id')
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey, '_nango_connections.environment_id': environmentId, deleted: false })
            .first();
        if (!result) {
            return Err('failed_to_fetch_connection');
        }

        return Ok({ connection: encryptionManager.decryptConnection(result.connection), end_user: result.end_user });
    }

    public async updateConnection(connection: DBConnectionDecrypted) {
        const res = await db.knex
            .from<DBConnection>(`_nango_connections`)
            .where({
                connection_id: connection.connection_id,
                provider_config_key: connection.provider_config_key,
                environment_id: connection.environment_id,
                deleted: false
            })
            .update(encryptionManager.encryptConnection(connection))
            .returning('*');
        return encryptionManager.decryptConnection(res[0]!);
    }

    public async setRefreshFailure({ id, lastRefreshFailure, currentAttempt }: { id: number; lastRefreshFailure?: Date | null; currentAttempt: number }) {
        let attempt = currentAttempt || 1;
        const now = new Date();

        // Only increment once per day to avoid burst failed refresh invalidating a connection (e.g: provider being down)
        if (
            lastRefreshFailure &&
            (lastRefreshFailure.getFullYear() < now.getFullYear() ||
                lastRefreshFailure.getMonth() < now.getMonth() ||
                lastRefreshFailure.getDate() < now.getDate())
        ) {
            attempt += 1;
        }

        await db.knex
            .from<DBConnection>(`_nango_connections`)
            .where({ id })
            .update({
                updated_at: now,
                last_refresh_failure: now,
                last_refresh_success: null,
                refresh_attempts: attempt,
                refresh_exhausted: attempt >= MAX_CONSECUTIVE_DAYS_FAILED_REFRESH
            });
    }

    public async getConnectionConfig(connection: Pick<DBConnection, 'connection_id' | 'provider_config_key' | 'environment_id'>): Promise<ConnectionConfig> {
        const result = await db.knex.from<DBConnection>(`_nango_connections`).select('connection_config').where({
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

    public async countConnections({ environmentId, providerConfigKey }: { environmentId: number; providerConfigKey: string }): Promise<number> {
        const res = await db.knex
            .from<DBConnection>(`_nango_connections`)
            .where({ environment_id: environmentId, provider_config_key: providerConfigKey, deleted: false })
            .count<{ count: string }>('*')
            .first();

        return res?.count ? Number(res.count) : 0;
    }

    public async getConnectionsByEnvironmentAndConfig(environment_id: number, providerConfigKey: string): Promise<ConnectionInternal[]> {
        const result = await db.knex
            .from<DBConnection>(`_nango_connections`)
            .select<
                Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id' | 'connection_config'>[]
            >('id', 'connection_id', 'provider_config_key', 'environment_id', 'connection_config')
            .where({ environment_id, provider_config_key: providerConfigKey, deleted: false });

        if (!result || result.length == 0 || !result[0]) {
            return [];
        }

        return result;
    }

    public async getConnectionsByEnvironmentAndConfigId(environment_id: number, config_id: number): Promise<DBConnection[]> {
        const result = await db.knex.from<DBConnection>(`_nango_connections`).select('*').where({ environment_id, config_id, deleted: false });

        if (!result || result.length == 0 || !result[0]) {
            return [];
        }

        return result;
    }

    public async copyConnections(connections: DBConnection[], environment_id: number, config_id: number) {
        const newConnections = connections.map((connection) => {
            return {
                ...connection,
                id: undefined,
                environment_id,
                config_id
            };
        });

        await db.knex.batchInsert('_nango_connections', newConnections);
    }

    public async getStaleConnections({
        days,
        limit,
        cursor
    }: {
        days: number;
        limit: number;
        cursor?: number | undefined;
    }): Promise<{ connection: DBConnectionAsJSONRow; account: DBTeam; environment: DBEnvironment; cursor: number; integration: ProviderConfig }[]> {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - days);

        type T = Awaited<ReturnType<ConnectionService['getStaleConnections']>>;

        const query = db
            .readOnly<DBConnection>(`_nango_connections`)
            .join('_nango_configs', '_nango_connections.config_id', '_nango_configs.id')
            .join('_nango_environments', '_nango_connections.environment_id', '_nango_environments.id')
            .join('_nango_accounts', '_nango_environments.account_id', '_nango_accounts.id')
            .select<T>(
                db.knex.raw('row_to_json(_nango_connections.*) as connection'),
                db.knex.raw('row_to_json(_nango_configs.*) as integration'),
                db.knex.raw('row_to_json(_nango_environments.*) as environment'),
                db.knex.raw('row_to_json(_nango_accounts.*) as account')
            )
            .where('_nango_connections.deleted', false)
            .andWhere((builder) => builder.where('refresh_exhausted', false).orWhereNull('refresh_exhausted'))
            .andWhere((builder) => builder.where('last_fetched_at', '<', dateThreshold).orWhereNull('last_fetched_at'))
            .orderBy('_nango_connections.id', 'asc')
            .limit(limit);

        if (cursor) {
            query.andWhere('_nango_connections.id', '>', cursor);
        }

        const result = await query;
        return result || [];
    }

    public async replaceMetadata(ids: number[], metadata: Metadata, trx: Knex.Transaction) {
        await trx.from<DBConnection>(`_nango_connections`).whereIn('id', ids).andWhere({ deleted: false }).update({ metadata });
    }

    public async replaceConnectionConfig(connection: Pick<DBConnection, 'id'>, config: ConnectionConfig) {
        await db.knex.from<DBConnection>(`_nango_connections`).where({ id: connection.id, deleted: false }).update({ connection_config: config });
    }

    public async updateMetadata(connections: Pick<DBConnection, 'id' | 'metadata'>[], metadata: Metadata): Promise<void> {
        await db.knex.transaction(async (trx) => {
            for (const connection of connections) {
                const newMetadata = { ...connection.metadata, ...metadata };
                await this.replaceMetadata([connection.id], newMetadata, trx);
            }
        });
    }

    public async updateConnectionConfig(
        connection: Pick<DBConnection, 'id' | 'connection_id' | 'provider_config_key' | 'environment_id'>,
        config: ConnectionConfig
    ): Promise<ConnectionConfig> {
        const existingConfig = await this.getConnectionConfig(connection);
        const newConfig = { ...existingConfig, ...config };
        await this.replaceConnectionConfig(connection, newConfig);

        return newConfig;
    }

    public async findConnectionsByConnectionConfigValue(key: string, value: string, environmentId: number): Promise<DBConnectionDecrypted[] | null> {
        const result = await db.knex
            .from<DBConnection>(`_nango_connections`)
            .select('*')
            .where({ environment_id: environmentId })
            .whereRaw(`connection_config->>:key = :value AND deleted = false`, { key, value });

        if (!result || result.length == 0) {
            return null;
        }

        return result.map((connection) => encryptionManager.decryptConnection(connection));
    }

    public async findConnectionsByMetadataValue({
        metadataProperty,
        payloadIdentifier,
        configId,
        environmentId
    }: {
        metadataProperty: string;
        payloadIdentifier: string;
        configId: number | undefined;
        environmentId: number;
    }): Promise<DBConnectionDecrypted[] | null> {
        if (!configId) {
            return null;
        }

        const result = await db.knex
            .from<DBConnection>(`_nango_connections`)
            .select('*')
            .where({ environment_id: environmentId, config_id: configId })
            // escape the question mark so it doesn't try to bind it as a parameter
            .where(db.knex.raw(`metadata->? \\? ?`, [metadataProperty, payloadIdentifier]))
            .andWhere('deleted', false);

        if (!result || result.length == 0) {
            return null;
        }

        return result.map((connection) => encryptionManager.decryptConnection(connection));
    }

    public async findConnectionsByMultipleConnectionConfigValues(keyValuePairs: KeyValuePairs, environmentId: number): Promise<DBConnectionDecrypted[] | null> {
        let query = db.knex.from<DBConnection>(`_nango_connections`).select('*').where({ environment_id: environmentId });

        Object.entries(keyValuePairs).forEach(([key, value]) => {
            query = query.andWhereRaw(`connection_config->>:key = :value AND deleted = false`, { key, value });
        });

        const result = await query;

        if (!result || result.length == 0) {
            return null;
        }

        return result.map((connection) => encryptionManager.decryptConnection(connection));
    }

    /**
     * Only useful for private API
     */
    public async count({
        environmentId
    }: {
        environmentId: number;
    }): Promise<Result<{ total: number; withAuthError: number; withSyncError: number; withError: number }>> {
        const query = db.readOnly
            .from(`_nango_connections`)
            .select<{ total_connection: string; with_auth_error: string; with_sync_error: string; with_error: string }>(
                db.knex.raw('COUNT(DISTINCT _nango_connections.id) as total_connection'),
                db.knex.raw("COUNT(DISTINCT _nango_connections.id) FILTER (WHERE _nango_active_logs.type = 'auth') as with_auth_error"),
                db.knex.raw("COUNT(DISTINCT _nango_connections.id) FILTER (WHERE _nango_active_logs.type = 'sync') as with_sync_error"),
                db.knex.raw('COUNT(DISTINCT _nango_connections.id) FILTER (WHERE _nango_active_logs.type IS NOT NULL) as with_error')
            )
            .leftJoin('_nango_active_logs', (join) => {
                join.on('_nango_active_logs.connection_id', '_nango_connections.id').andOnVal('active', true);
            })
            .where({
                '_nango_connections.environment_id': environmentId,
                '_nango_connections.deleted': false
            })
            .first();

        const res = await query;
        if (!res) {
            return Err('failed_to_count');
        }

        return Ok({
            total: Number(res.total_connection),
            withAuthError: Number(res.with_auth_error),
            withSyncError: Number(res.with_sync_error),
            withError: Number(res.with_error)
        });
    }

    /**
     * List connections with associated data (active_logs, end_users) and pagination
     * If you want the raw list, use something else
     */
    public async listConnections({
        environmentId,
        connectionId,
        integrationIds,
        withError,
        search,
        endUserId,
        endUserOrganizationId,
        limit = 1000,
        page = 0
    }: {
        environmentId: number;
        connectionId?: string | undefined;
        integrationIds?: string[] | undefined;
        withError?: boolean | undefined;
        search?: string | undefined;
        endUserId?: string | undefined;
        endUserOrganizationId?: string | undefined;
        limit?: number;
        page?: number | undefined;
    }): Promise<{ connection: DBConnectionAsJSONRow; end_user: DBEndUser | null; active_logs: [{ type: string; log_id: string }]; provider: string }[]> {
        const query = db.readOnly
            .from<DBConnection>(`_nango_connections`)
            .select<{ connection: DBConnectionAsJSONRow; end_user: DBEndUser | null; active_logs: [{ type: string; log_id: string }]; provider: string }[]>(
                db.knex.raw('row_to_json(_nango_connections.*) as connection'),
                db.knex.raw('row_to_json(end_users.*) as end_user'),
                db.knex.raw(`
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'type', _nango_active_logs.type,
                                'log_id', _nango_active_logs.log_id
                            )
                        ) FILTER (WHERE _nango_active_logs.id IS NOT NULL)
                        , '[]'::json
                    ) as active_logs
               `),
                db.knex.raw('count(_nango_active_logs.id) as active_logs_count'),
                '_nango_configs.provider'
            )
            .join('_nango_configs', '_nango_connections.config_id', '_nango_configs.id')
            .leftJoin('end_users', 'end_users.id', '_nango_connections.end_user_id')
            .leftJoin(ACTIVE_LOG_TABLE, function () {
                this.on(`${ACTIVE_LOG_TABLE}.connection_id`, '_nango_connections.id').andOn(`${ACTIVE_LOG_TABLE}.active`, db.knex.raw(true));
            })
            .where({
                '_nango_connections.environment_id': environmentId,
                '_nango_connections.deleted': false
            })
            .orderBy('_nango_connections.created_at', 'desc')
            .groupBy('_nango_connections.id', 'end_users.id', '_nango_configs.provider')
            .limit(limit)
            .offset(page * limit);

        if (search) {
            query.where(function () {
                this.whereRaw('_nango_connections.connection_id ILIKE ?', `%${search}%`)
                    .orWhereRaw('end_users.display_name ILIKE ?', `%${search}%`)
                    .orWhereRaw('end_users.email ILIKE ?', `%${search}%`);
            });
        }
        if (integrationIds) {
            query.whereIn('_nango_configs.unique_key', integrationIds);
        }
        if (connectionId) {
            query.where('_nango_connections.connection_id', connectionId);
        }
        if (endUserId) {
            query.where('end_users.end_user_id', endUserId);
        }
        if (endUserOrganizationId) {
            query.where('end_users.organization_id', endUserOrganizationId);
        }

        if (withError === false) {
            query.havingRaw('count(_nango_active_logs.id) = 0');
        } else if (withError === true) {
            query.havingRaw('count(_nango_active_logs.id) > 0');
        }

        return await query;
    }

    public async deleteConnection({
        connection,
        providerConfigKey,
        environmentId,
        orchestrator,
        preDeletionHook,
        slackService
    }: {
        connection: DBConnectionDecrypted;
        providerConfigKey: string;
        environmentId: number;
        orchestrator: Orchestrator;
        slackService: SlackService;
        preDeletionHook: () => Promise<void>;
    }): Promise<number> {
        await preDeletionHook();

        const del = await db.knex
            .from(`_nango_connections`)
            .where({
                connection_id: connection.connection_id,
                provider_config_key: providerConfigKey,
                environment_id: environmentId,
                deleted: false
            })
            .update({ deleted: true, credentials: {}, credentials_iv: null, credentials_tag: null, deleted_at: new Date() });

        // TODO: move the following side effects to a post deletion hook
        // so we can remove the orchestrator dependencies
        await syncManager.softDeleteSyncsByConnection(connection, orchestrator);
        await slackService.closeOpenNotificationForConnection({ connectionId: connection.id, environmentId });

        return del;
    }

    public async updateLastFetched(id: number) {
        await db.knex.from<DBConnection>(`_nango_connections`).where({ id, deleted: false }).update({ last_fetched_at: new Date() });
    }

    // Parses and arbitrary object (e.g. a server response or a user provided auth object) into AuthCredentials.
    // Throws if values are missing/missing the input is malformed.
    public parseRawCredentials(rawCredentials: object, authMode: AuthModeType, template?: ProviderOAuth2 | ProviderTwoStep): AuthCredentials {
        const rawCreds = rawCredentials as Record<string, any>;

        switch (authMode) {
            case 'OAUTH2': {
                let accessToken: string | undefined = rawCreds['access_token'];

                if (!accessToken && template && 'alternate_access_token_response_path' in template && template.alternate_access_token_response_path) {
                    accessToken = extractValueByPath(rawCreds, template.alternate_access_token_response_path);
                }

                if (!accessToken) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }
                let expiresAt: Date | undefined;

                if (rawCreds['expires_at']) {
                    expiresAt = parseTokenExpirationDate(rawCreds['expires_at']);
                } else if (rawCreds['expires_in']) {
                    expiresAt = new Date(Date.now() + Number.parseInt(rawCreds['expires_in'], 10) * 1000);
                }

                const oauth2Creds: OAuth2Credentials = {
                    type: 'OAUTH2',
                    access_token: accessToken,
                    refresh_token: rawCreds['refresh_token'],
                    expires_at: expiresAt,
                    raw: rawCreds
                };

                return oauth2Creds;
            }

            case 'OAUTH1': {
                if (!rawCreds['oauth_token'] || !rawCreds['oauth_token_secret']) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }

                const oauth1Creds: OAuth1Credentials = {
                    type: 'OAUTH1',
                    oauth_token: rawCreds['oauth_token'],
                    oauth_token_secret: rawCreds['oauth_token_secret'],
                    raw: rawCreds
                };

                return oauth1Creds;
            }

            case 'OAUTH2_CC': {
                if (!rawCreds['access_token'] && !(rawCreds['data'] && rawCreds['data']['token']) && !rawCreds['jwt']) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }

                let expiresAt: Date | undefined;

                //fiserv returns expires_in in milliseconds
                if (rawCreds['expires_at']) {
                    expiresAt = parseTokenExpirationDate(rawCreds['expires_at']);
                } else if (rawCreds['expires_in']) {
                    const expiresIn = Number.parseInt(rawCreds['expires_in'], 10);
                    const multiplier = template && 'expires_in_unit' in template && template.expires_in_unit === 'milliseconds' ? 1 : 1000;
                    expiresAt = new Date(Date.now() + expiresIn * multiplier);
                } else {
                    expiresAt = new Date(Date.now() + DEFAULT_OAUTHCC_EXPIRES_AT_MS);
                }

                const oauth2Creds: OAuth2ClientCredentials = {
                    type: 'OAUTH2_CC',
                    token: rawCreds['access_token'] || (rawCreds['data'] && rawCreds['data']['token']) || rawCreds['jwt'],
                    client_id: '',
                    client_secret: '',
                    expires_at: expiresAt,
                    raw: rawCreds
                };

                return oauth2Creds;
            }

            case 'TWO_STEP': {
                if (!template || !('token_response' in template)) {
                    throw new NangoError(`Token response structure is missing for TWO_STEP.`);
                }

                const tokenPath = template.token_response.token;
                const expirationPath = template.token_response.token_expiration;
                const expirationStrategy = template.token_response.token_expiration_strategy;

                const token = extractValueByPath(rawCreds, tokenPath);
                const expiration = extractValueByPath(rawCreds, expirationPath);

                if (!token) {
                    throw new NangoError(`incomplete_raw_credentials`);
                }
                let expiresAt: Date | undefined;

                if (expirationStrategy === 'expireAt' && expiration) {
                    expiresAt = parseTokenExpirationDate(expiration);
                } else if (expirationStrategy === 'expireIn' && expiration) {
                    if (Number.isSafeInteger(Number(expiration))) {
                        expiresAt = new Date(Date.now() + Number(expiration) * 1000);
                    } else {
                        const durationMs = ms(expiration);
                        if (!durationMs) {
                            throw new NangoError(`Unsupported expiration format: ${expiration}`);
                        }
                        expiresAt = new Date(Date.now() + durationMs);
                    }
                } else if (template.token_expires_in_ms) {
                    expiresAt = new Date(Date.now() + template.token_expires_in_ms);
                }

                const twoStepCredentials: TwoStepCredentials = {
                    type: 'TWO_STEP',
                    token: token,
                    expires_at: expiresAt,
                    raw: rawCreds
                };

                return twoStepCredentials;
            }

            default:
                throw new NangoError(`Cannot parse credentials, unknown credentials type: ${JSON.stringify(rawCreds, undefined, 2)}`);
        }
    }

    public async getAppCredentialsAndFinishConnection(
        connectionId: string,
        integration: ProviderConfig,
        provider: ProviderGithubApp,
        connectionConfig: ConnectionConfig,
        logCtx: LogContext,
        connectionCreatedHook: (res: ConnectionUpsertResponse) => MaybePromise<void>
    ): Promise<Result<void, AuthCredentialsError>> {
        const create = await githubAppClient.createCredentials({
            integration,
            provider,
            connectionConfig
        });
        if (create.isErr()) {
            return Err(create.error);
        }

        const [updatedConnection] = await this.upsertConnection({
            connectionId,
            providerConfigKey: integration.unique_key,
            parsedRawCredentials: create.value,
            connectionConfig,
            environmentId: integration.environment_id
        });

        if (updatedConnection) {
            void connectionCreatedHook(updatedConnection);
        }

        void logCtx.info('App connection was approved and credentials were saved');
        return Ok(undefined);
    }

    public async getOauthClientCredentials({
        provider,
        client_id,
        client_secret,
        connectionConfig,
        logCtx
    }: {
        provider: ProviderOAuth2;
        client_id: string;
        client_secret: string;
        connectionConfig: ConnectionConfig;
        logCtx: LogContextStateless;
    }): Promise<ServiceResponse<OAuth2ClientCredentials>> {
        const strippedTokenUrl = typeof provider.token_url === 'string' ? provider.token_url.replace(/connectionConfig\./g, '') : '';
        const url = new URL(interpolateString(strippedTokenUrl, connectionConfig));

        let interpolatedParams: Record<string, any> = {};
        if (provider.token_params) {
            interpolatedParams = interpolateObjectValues(provider.token_params, connectionConfig);
        }
        let tokenParams = interpolatedParams && Object.keys(interpolatedParams).length > 0 ? new URLSearchParams(interpolatedParams).toString() : '';

        if (connectionConfig['oauth_scopes'] && typeof connectionConfig['oauth_scopes'] === 'string') {
            const scope = connectionConfig['oauth_scopes'].split(',').join(provider.scope_separator || ' ');
            tokenParams += (tokenParams ? '&' : '') + `scope=${encodeURIComponent(scope)}`;
        }

        const headers: Record<string, string> = {};
        const params = new URLSearchParams();

        const bodyFormat = provider.body_format || 'form';
        headers['Content-Type'] = bodyFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded';

        if (provider.token_request_auth_method === 'basic') {
            headers['Authorization'] = 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64');
        } else if (provider.token_request_auth_method === 'custom') {
            params.append('username', client_id);
            params.append('password', client_secret);
        } else {
            params.append('client_id', client_id);
            params.append('client_secret', client_secret);
        }

        if (tokenParams) {
            const tokenParamsEntries = new URLSearchParams(tokenParams).entries();
            for (const [key, value] of tokenParamsEntries) {
                params.append(key, value);
            }
        }
        if (connectionConfig['authorization_params']) {
            for (const [key, value] of Object.entries(connectionConfig['authorization_params'])) {
                params.set(key, value);
            }
        }

        const fetchRes = await loggedFetch<Record<string, any>>(
            {
                url,
                method: 'POST',
                headers,
                body: bodyFormat === 'json' ? JSON.stringify(Object.fromEntries(params.entries())) : params.toString()
            },
            { logCtx, context: 'auth', valuesToFilter: [client_secret] }
        );
        if (fetchRes.isErr() || fetchRes.value.res.status >= 300) {
            const error = new NangoError('client_credentials_fetch_error');
            return { success: false, error, response: null };
        }

        const parsedCreds = this.parseRawCredentials(fetchRes.value.body, 'OAUTH2_CC', provider) as OAuth2ClientCredentials;

        parsedCreds.client_id = client_id;
        parsedCreds.client_secret = client_secret;

        return { success: true, error: null, response: parsedCreds };
    }

    public async getTwoStepCredentials(
        provider: ProviderTwoStep,
        dynamicCredentials: Record<string, any>,
        connectionConfig: Record<string, string>
    ): Promise<ServiceResponse<TwoStepCredentials>> {
        const strippedTokenUrl = typeof provider.token_url === 'string' ? provider.token_url.replace(/connectionConfig\./g, '') : '';
        const url = new URL(interpolateString(strippedTokenUrl, connectionConfig)).toString();

        const bodyFormat = provider.body_format || 'json';

        let postBody: Record<string, any> | string = {};

        if (provider.token_params) {
            for (const [key, value] of Object.entries(provider.token_params)) {
                const strippedValue = stripCredential(value);

                if (typeof strippedValue === 'object' && strippedValue !== null) {
                    postBody[key] = interpolateObject(strippedValue, dynamicCredentials);
                } else if (typeof strippedValue === 'string') {
                    postBody[key] = interpolateString(strippedValue, dynamicCredentials);
                } else {
                    postBody[key] = strippedValue;
                }
            }
            postBody = interpolateObjectValues(postBody, connectionConfig);
        }

        const headers: Record<string, any> | string = {};

        if (provider.token_headers) {
            for (const [key, value] of Object.entries(provider.token_headers)) {
                const strippedValue = stripCredential(value);
                if (typeof strippedValue === 'object' && strippedValue !== null) {
                    headers[key] = interpolateObject(strippedValue, dynamicCredentials);
                } else if (typeof strippedValue === 'string') {
                    headers[key] = interpolateString(strippedValue, dynamicCredentials);
                } else {
                    headers[key] = strippedValue;
                }
            }
        }

        try {
            const requestOptions = { headers };

            const bodyContent =
                bodyFormat === 'xml'
                    ? new XMLBuilder({
                          format: true,
                          indentBy: '  ',
                          attributeNamePrefix: '$',
                          ignoreAttributes: false
                      }).build(postBody)
                    : bodyFormat === 'form'
                      ? new URLSearchParams(postBody).toString()
                      : JSON.stringify(postBody);

            let response: any;
            if (provider.token_request_method === 'GET') {
                response = await axios.get(url.toString(), requestOptions);
            } else {
                response = await axios.post(url.toString(), bodyContent, requestOptions);
            }

            if (response.status !== 200) {
                return { success: false, error: new NangoError('invalid_two_step_credentials'), response: null };
            }

            let responseData: any = response.data;

            if (bodyFormat === 'xml' && typeof response.data === 'string') {
                const parser = new XMLParser({
                    ignoreAttributes: false,
                    parseAttributeValue: true,
                    trimValues: true
                });

                responseData = parser.parse(response.data);
            }

            const stepResponses: any[] = [responseData];
            if (provider.additional_steps) {
                for (let stepIndex = 1; stepIndex <= provider.additional_steps.length; stepIndex++) {
                    const step = provider.additional_steps[stepIndex - 1];
                    if (!step) {
                        continue;
                    }

                    let stepPostBody: Record<string, any> = {};

                    if (step.token_params) {
                        for (const [key, value] of Object.entries(step.token_params)) {
                            const stepNumber = extractStepNumber(value);
                            const stepResponsesObj = stepNumber !== null ? getStepResponse(stepNumber, stepResponses) : {};

                            const applyInterpolation = (input: any, source: Record<string, any>) => {
                                if (typeof input === 'object' && input !== null) {
                                    return interpolateObject(input, source);
                                } else if (typeof input === 'string') {
                                    return interpolateString(input, source);
                                }
                                return input;
                            };

                            const credentials = applyInterpolation(stripCredential(value), dynamicCredentials);
                            const stepResponse = applyInterpolation(stripStepResponse(value), stepResponsesObj);
                            const isResolved = (val: any) => typeof val === 'string' && !val.includes('${');
                            stepPostBody[key] = isResolved(stepResponse) ? stepResponse : isResolved(credentials) ? credentials : (stepResponse ?? credentials);
                        }
                        stepPostBody = interpolateObjectValues(stepPostBody, connectionConfig);
                    }

                    const stepNumberForURL = extractStepNumber(step.token_url);
                    const stepResponsesObjForURL = stepNumberForURL !== null ? getStepResponse(stepNumberForURL, stepResponses) : {};
                    const strippedTokenUrl = stripStepResponse(step.token_url);
                    const stepUrl = new URL(interpolateString(strippedTokenUrl, stepResponsesObjForURL)).toString();
                    const stepBodyContent = bodyFormat === 'form' ? new URLSearchParams(stepPostBody).toString() : JSON.stringify(stepPostBody);

                    const stepHeaders: Record<string, string> = {};

                    if (step.token_headers) {
                        for (const [key, value] of Object.entries(step.token_headers)) {
                            stepHeaders[key] = interpolateString(value, dynamicCredentials);
                        }
                    }

                    const stepRequestOptions = { headers: stepHeaders };

                    let stepResponse: any;

                    if (step.token_request_method === 'GET') {
                        stepResponse = await axios.get(stepUrl, stepRequestOptions);
                    } else {
                        stepResponse = await axios.post(stepUrl, stepBodyContent, stepRequestOptions);
                    }

                    if (stepResponse.status !== 200) {
                        return { success: false, error: new NangoError(`invalid_two_step_credentials_step_${stepIndex}`), response: null };
                    }

                    stepResponses.push(stepResponse.data);
                }
            }
            const parsedCreds = this.parseRawCredentials(stepResponses[stepResponses.length - 1], 'TWO_STEP', provider) as TwoStepCredentials;

            for (const [key, value] of Object.entries(dynamicCredentials)) {
                if (value !== undefined) {
                    parsedCreds[key] = value;
                }
            }

            return { success: true, error: null, response: parsedCreds };
        } catch (err: any) {
            const errorPayload = {
                message: err.message || 'Unknown error',
                name: err.name || 'Error'
            };
            logger.error(`Error fetching TwoStep credentials tokens ${stringifyError(err)}`);
            const error = new NangoError('two_step_credentials_fetch_error', errorPayload);

            return { success: false, error, response: null };
        }
    }

    public async shouldCapUsage({
        providerConfigKey,
        environmentId,
        type,
        team,
        user,
        plan
    }: {
        providerConfigKey: string;
        environmentId: number;
        type: 'activate' | 'deploy';
        team: DBTeam;
        user?: DBUser;
        plan: DBPlan | null;
    }): Promise<boolean> {
        if (!plan || !plan.connection_with_scripts_max) {
            return false;
        }

        const count = await this.countConnections({ environmentId, providerConfigKey });

        if (count > plan.connection_with_scripts_max) {
            logger.info(`Reached cap for providerConfigKey: ${providerConfigKey} and environmentId: ${environmentId}`);
            if (type === 'deploy') {
                productTracking.track({ name: 'server:resource_capped:script_deploy_is_disabled', team, user });
            } else {
                productTracking.track({ name: 'server:resource_capped:script_activate', team, user });
            }
            return true;
        }

        return false;
    }

    public async getNewCredentials({
        connection,
        providerConfig,
        provider,
        logCtx
    }: {
        connection: DBConnectionDecrypted;
        providerConfig: ProviderConfig;
        provider: Provider;
        logCtx: LogContextStateless;
    }): Promise<
        ServiceResponse<
            | OAuth2Credentials
            | OAuth2ClientCredentials
            | AppCredentials
            | AppStoreCredentials
            | TableauCredentials
            | JwtCredentials
            | BillCredentials
            | TwoStepCredentials
            | SignatureCredentials
        >
    > {
        if (providerClient.shouldUseProviderClient(providerConfig.provider)) {
            const rawCreds = await providerClient.refreshToken(provider as ProviderOAuth2, providerConfig, connection);
            const parsedCreds = this.parseRawCredentials(rawCreds, 'OAUTH2', provider as ProviderOAuth2) as OAuth2Credentials;

            return { success: true, error: null, response: parsedCreds };
        } else if (provider.auth_mode === 'OAUTH2_CC') {
            const { client_id, client_secret } = connection.credentials as OAuth2ClientCredentials;
            const {
                success,
                error,
                response: credentials
            } = await this.getOauthClientCredentials({
                provider: provider as ProviderOAuth2,
                client_id,
                client_secret,
                connectionConfig: connection.connection_config,
                logCtx
            });

            if (!success || !credentials) {
                return { success, error, response: null };
            }

            return { success: true, error: null, response: credentials };
        } else if (provider.auth_mode === 'APP_STORE') {
            const { private_key } = connection.credentials as AppStoreCredentials;
            const create = await appleAppStoreClient.createCredentials({
                provider: provider as ProviderAppleAppStore,
                connectionConfig: connection.connection_config,
                private_key
            });

            if (create.isErr()) {
                return { success: false, error: create.error, response: null };
            }

            return { success: true, error: null, response: create.value };
        } else if (provider.auth_mode === 'JWT') {
            const { token, expires_at, type, ...dynamicCredentials } = connection.credentials as JwtCredentials;
            const { type: _, ...cleanDynamicCredentials } = dynamicCredentials;
            const create = jwtClient.createCredentials({
                config: providerConfig.unique_key,
                provider: provider as ProviderJwt,
                dynamicCredentials: cleanDynamicCredentials
            });

            if (create.isErr()) {
                return { success: false, error: create.error, response: null };
            }

            return { success: true, error: null, response: create.value };
        } else if (provider.auth_mode === 'APP' || (provider.auth_mode === 'CUSTOM' && connection.credentials.type !== 'OAUTH2')) {
            const create = await githubAppClient.createCredentials({
                integration: providerConfig,
                provider: provider as ProviderGithubApp,
                connectionConfig: connection.connection_config
            });
            if (create.isErr()) {
                return { success: false, error: create.error, response: null };
            }

            return { success: true, error: null, response: create.value };
        } else if (provider.auth_mode === 'TABLEAU') {
            const { pat_name, pat_secret, content_url } = connection.credentials as TableauCredentials;
            const create = await tableauClient.createCredentials({
                provider: provider as ProviderTableau,
                patName: pat_name,
                patSecret: pat_secret,
                contentUrl: content_url,
                connectionConfig: connection.connection_config
            });

            if (create.isErr()) {
                return { success: false, error: create.error, response: null };
            }

            return { success: true, error: null, response: create.value };
        } else if (provider.auth_mode === 'BILL') {
            const { username, password, organization_id, dev_key } = connection.credentials as BillCredentials;
            const create = await billClient.createCredentials({
                provider: provider as ProviderBill,
                username,
                password,
                organizationId: organization_id,
                devKey: dev_key
            });

            if (create.isErr()) {
                return { success: false, error: create.error, response: null };
            }

            return { success: true, error: null, response: create.value };
        } else if (provider.auth_mode === 'TWO_STEP') {
            const { token, expires_at, type, raw, ...dynamicCredentials } = connection.credentials as TwoStepCredentials;
            const {
                success,
                error,
                response: credentials
            } = await this.getTwoStepCredentials(provider as ProviderTwoStep, dynamicCredentials, connection.connection_config);

            if (!success || !credentials) {
                return { success, error, response: null };
            }

            return { success: true, error: null, response: credentials };
        } else if (provider.auth_mode === 'SIGNATURE') {
            const { username, password } = connection.credentials as SignatureCredentials;
            const create = signatureClient.createCredentials({
                provider: provider as ProviderSignature,
                username,
                password
            });

            if (create.isErr()) {
                return { success: false, error: create.error, response: null };
            }

            return { success: true, error: null, response: create.value };
        } else {
            const {
                success,
                error,
                response: creds
            } = await getFreshOAuth2Credentials({ connection, config: providerConfig, provider: provider as ProviderOAuth2, logCtx });

            return { success, error, response: success ? (creds as OAuth2Credentials) : null };
        }
    }

    // return the number of connections per account
    async countMetric(): Promise<
        Result<
            {
                accountId: number;
                count: number;
                withActions: number;
                withSyncs: number;
                withWebhooks: number;
            }[],
            NangoError
        >
    > {
        const res = await db.readOnly
            .from('_nango_connections')
            .join('_nango_environments', '_nango_connections.environment_id', '_nango_environments.id')
            .join('_nango_configs', function () {
                this.on('_nango_configs.unique_key', '=', '_nango_connections.provider_config_key').andOn(
                    '_nango_configs.environment_id',
                    '=',
                    '_nango_connections.environment_id'
                );
            })
            .leftJoin('_nango_sync_configs', '_nango_sync_configs.nango_config_id', '_nango_configs.id')
            .select<
                {
                    accountId: number;
                    count: number;
                    withActions: number;
                    withSyncs: number;
                    withWebhooks: number;
                }[]
            >(
                db.knex.raw(`_nango_environments.account_id as "accountId"`),
                db.knex.raw(`count(DISTINCT _nango_connections.id) AS "count"`),
                db.knex.raw(`count(DISTINCT CASE WHEN _nango_sync_configs.type = 'action' THEN _nango_connections.id ELSE NULL END) as "withActions"`),
                db.knex.raw(`count(DISTINCT CASE WHEN _nango_sync_configs.type = 'sync' THEN _nango_connections.id ELSE NULL END) as "withSyncs"`),
                db.knex.raw(
                    `count(DISTINCT CASE WHEN _nango_sync_configs.webhook_subscriptions IS NOT NULL AND array_length(_nango_sync_configs.webhook_subscriptions, 1) > 0 THEN _nango_connections.id ELSE NULL END) as "withWebhooks"`
                )
            )
            .whereNull('_nango_connections.deleted_at')
            .whereNull('_nango_sync_configs.deleted_at')
            .where(function () {
                this.where('_nango_sync_configs.active', true).orWhereNull('_nango_sync_configs.active');
            })
            .where(function () {
                this.where('_nango_sync_configs.enabled', true).orWhereNull('_nango_sync_configs.enabled');
            })
            .groupBy('_nango_environments.account_id');

        if (res) {
            return Ok(res);
        }

        return Err(new NangoError('failed_to_get_connections_count'));
    }

    /**
     * Note:
     * a billable connection is a connection that is not deleted and has not been deleted during the month
     * connections are pro-rated based on the number of seconds they were existing in the month
     *
     * This method only returns returns data for paying customer
     */
    async billableConnections(referenceDate: Date): Promise<
        Result<
            {
                accountId: number;
                count: number;
                year: number;
                month: number;
            }[],
            NangoError
        >
    > {
        const targetDate = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), 0, 0, 0, 0));
        const year = referenceDate.getUTCFullYear();
        const month = referenceDate.getUTCMonth() + 1; // js months are 0-based

        const res = await db.readOnly
            .with('month_info', (qb) => {
                qb.select(
                    db.readOnly.raw(`DATE_TRUNC('month', ?::date) AS month_start`, [targetDate]),
                    db.readOnly.raw(`(DATE_TRUNC('month', ?::date) + INTERVAL '1 month' - INTERVAL '1 day')::date AS month_end`, [targetDate]),
                    db.readOnly.raw(
                        `EXTRACT(EPOCH FROM (DATE_TRUNC('month', ?::date) + INTERVAL '1 month') - DATE_TRUNC('month', ?::date)) AS total_seconds_in_month`,
                        [targetDate, targetDate]
                    )
                );
            })
            .with('billable_connections', (qb) => {
                qb.select(
                    'e.account_id',
                    'c.id as connection_id',
                    'c.created_at',
                    db.readOnly.raw(`COALESCE(c.deleted_at, (SELECT month_end FROM month_info) + INTERVAL '1 day') AS effective_end_date`),
                    db.readOnly.raw(`(SELECT month_start FROM month_info) AS month_start`),
                    db.readOnly.raw(`(SELECT month_end FROM month_info) AS month_end`),
                    db.readOnly.raw(`(SELECT total_seconds_in_month FROM month_info) AS total_seconds_in_month`)
                )
                    .from('_nango_connections as c')
                    .join('_nango_environments as e', 'c.environment_id', 'e.id')
                    .join('plans', 'plans.account_id', 'e.account_id')
                    .where((builder) => {
                        builder.where('c.deleted_at', null).orWhereRaw(`c.deleted_at >= (SELECT month_start FROM month_info)`);
                    })
                    .whereRaw(`c.created_at <= (SELECT month_end FROM month_info) + INTERVAL '1 day'`);
            })
            .with('prorated', (qb) => {
                qb.select(
                    'account_id',
                    'connection_id',
                    db.readOnly.raw(`
                        CASE
                            WHEN created_at < month_start AND (effective_end_date > month_end OR effective_end_date IS NULL)
                                THEN 1.0
                            WHEN created_at < month_start AND effective_end_date <= month_end
                                THEN EXTRACT(EPOCH FROM (effective_end_date - month_start)) / total_seconds_in_month
                            WHEN created_at >= month_start AND (effective_end_date > month_end OR effective_end_date IS NULL)
                                THEN EXTRACT(EPOCH FROM (month_end + INTERVAL '1 day' - created_at)) / total_seconds_in_month
                            ELSE EXTRACT(EPOCH FROM (effective_end_date - created_at)) / total_seconds_in_month
                        END AS connection_weight
                    `)
                ).from('billable_connections');
            })
            .with('totals', (qb) => {
                qb.select(
                    'account_id as accountId',
                    db.readOnly.raw(`FLOOR(SUM(connection_weight)) as count`),
                    db.readOnly.raw(`${year} as year`),
                    db.readOnly.raw(`${month} as month`)
                )
                    .from('prorated')
                    .groupBy('account_id');
            })
            .select('*')
            .from('totals')
            .where('count', '>', 0);

        if (res) {
            return Ok(res);
        }
        return Err(new NangoError('failed_to_get_billable_connections'));
    }

    async getSoftDeleted({ limit, olderThan }: { limit: number; olderThan: number }): Promise<DBConnection[]> {
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - olderThan);

        return await db.knex
            .select('*')
            .from<DBConnection>(`_nango_connections`)
            .where('deleted', true)
            .andWhere('deleted_at', '<=', dateThreshold.toISOString())
            .limit(limit);
    }

    async hardDeleteByIntegration({ integrationId, limit }: { integrationId: number; limit: number }): Promise<number> {
        return await db.knex
            .from<DBConnection>('_nango_connections')
            .whereIn('id', function (sub) {
                sub.select('id').from<DBConnection>('_nango_connections').where('config_id', integrationId).limit(limit);
            })
            .delete();
    }

    async hardDelete(id: number): Promise<number> {
        return await db.knex.from<DBConnection>('_nango_connections').where('id', id).delete();
    }
}

export default new ConnectionService();
