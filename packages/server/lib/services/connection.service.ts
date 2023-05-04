import type { AuthCredentials, OAuth2Credentials, OAuth1Credentials, CredentialsRefresh, StoredConnection } from '../models.js';
import { ProviderAuthModes, ProviderTemplateOAuth2 } from '../models.js';
import { getFreshOAuth2Credentials } from '../clients/oauth2.client.js';
import db from '../db/database.js';
import type { ProviderConfig, Connection } from '../models.js';
import analytics from '../utils/analytics.js';
import providerClientManager from '../clients/provider.client.js';
import { fileLogger, LogData } from '../utils/file-logger.js';
import { parseTokenExpirationDate, isTokenExpired } from '../utils/utils.js';
import providerClient from '../clients/provider.client.js';
import { NangoError } from '../utils/error.js';
import encryptionManager from '../utils/encryption.manager.js';

class ConnectionService {
    private runningCredentialsRefreshes: CredentialsRefresh[] = [];

    public async upsertConnection(
        connectionId: string,
        providerConfigKey: string,
        provider: string,
        rawCredentials: object,
        authMode: ProviderAuthModes,
        connectionConfig: Record<string, string>,
        accountId: number,
        metadata: Record<string, string>
    ) {
        await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .insert(
                encryptionManager.encryptConnection({
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    credentials: this.parseRawCredentials(rawCredentials, authMode),
                    connection_config: connectionConfig,
                    account_id: accountId,
                    metadata: metadata
                })
            )
            .onConflict(['provider_config_key', 'connection_id', 'account_id'])
            .merge();
        analytics.track('server:connection_upserted', accountId, { provider: provider });
    }

    public async updateConnection(connection: Connection) {
        await db.knex
            .withSchema(db.schema())
            .from<StoredConnection>(`_nango_connections`)
            .where({ connection_id: connection.connection_id, provider_config_key: connection.provider_config_key, account_id: connection.account_id })
            .update(encryptionManager.encryptConnection(connection));
    }

    async getConnection(connectionId: string, providerConfigKey: string, accountId: number): Promise<Connection | null> {
        let result: StoredConnection[] | null = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<StoredConnection>(`_nango_connections`)
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey, account_id: accountId });

        let storedConnection = result == null || result.length == 0 ? null : result[0] || null;
        let connection = encryptionManager.decryptConnection(storedConnection);

        // Parse the token expiration date.
        if (connection != null && connection.credentials.type === ProviderAuthModes.OAuth2) {
            let creds = connection.credentials as OAuth2Credentials;
            creds.expires_at = creds.expires_at != null ? parseTokenExpirationDate(creds.expires_at) : undefined;
            connection.credentials = creds;
        }

        return connection;
    }

    async listConnections(accountId: number, connectionId?: string): Promise<{ id: number; connection_id: number; provider: string; created: string }[]> {
        let queryBuilder = db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .select({ id: 'id' }, { connection_id: 'connection_id' }, { provider: 'provider_config_key' }, { created: 'created_at' })
            .where({ account_id: accountId });
        if (connectionId) {
            queryBuilder.where({ connection_id: connectionId });
        }
        return queryBuilder;
    }

    async deleteConnection(connectionId: string, providerConfigKey: string, accountId: number): Promise<number> {
        return db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey, account_id: accountId })
            .del();
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

                var expiresAt: Date | undefined;

                if (rawCreds['expires_at']) {
                    expiresAt = parseTokenExpirationDate(rawCreds['expires_at']);
                } else if (rawCreds['expires_in']) {
                    expiresAt = new Date(Date.now() + Number.parseInt(rawCreds['expires_in'], 10) * 1000);
                }

                let oauth2Creds: OAuth2Credentials = {
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

                let oauth1Creds: OAuth1Credentials = {
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
        log = {} as LogData,
        instantRefresh = false
    ): Promise<OAuth2Credentials> {
        let connectionId = connection.connection_id;
        let credentials = connection.credentials as OAuth2Credentials;
        let providerConfigKey = connection.provider_config_key;

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

        let refresh =
            instantRefresh ||
            (providerClient.shouldIntrospectToken(providerConfig.provider) && (await providerClient.introspectedTokenExpired(providerConfig, connection)));
        // If not expiration date is set, e.g. Github, we assume the token doesn't expire (unless introspection enable like Salesforce).
        if (credentials.refresh_token && (refresh || (credentials.expires_at && isTokenExpired(credentials.expires_at)))) {
            const promise = new Promise<OAuth2Credentials>(async (resolve, reject) => {
                try {
                    var newCredentials: OAuth2Credentials;

                    if (providerClientManager.shouldUseProviderClient(providerConfig.provider)) {
                        let rawCreds = await providerClientManager.refreshToken(template, providerConfig, connection);
                        newCredentials = this.parseRawCredentials(rawCreds, ProviderAuthModes.OAuth2) as OAuth2Credentials;
                    } else {
                        newCredentials = await getFreshOAuth2Credentials(connection, providerConfig, template as ProviderTemplateOAuth2);
                    }

                    connection.credentials = newCredentials;

                    await this.updateConnection(connection);

                    // Remove ourselves from the array of running refreshes
                    this.runningCredentialsRefreshes = this.runningCredentialsRefreshes.filter((value) => {
                        return !(value.providerConfigKey === providerConfigKey && value.connectionId === connectionId);
                    });

                    resolve(newCredentials);
                } catch (e) {
                    // Remove ourselves from the array of running refreshes
                    this.runningCredentialsRefreshes = this.runningCredentialsRefreshes.filter((value) => {
                        return !(value.providerConfigKey === providerConfigKey && value.connectionId === connectionId);
                    });

                    if (log) {
                        log.action = 'token';
                        log.level = 'error';
                        log.end = Date.now();
                        log.success = false;
                        log.timestamp = Date.now();
                        log.messages = [
                            {
                                content: `Refresh oauth2 token call failed`,
                                timestamp: Date.now()
                            }
                        ];
                        fileLogger.error('', log);
                    }
                    reject(e);
                }
            });

            const refresh = {
                connectionId: connectionId,
                providerConfigKey: providerConfigKey,
                promise: promise
            } as CredentialsRefresh;

            log.messages.push({
                content: `Token refresh for ${providerConfigKey} and connection ${connectionId}`,
                timestamp: Date.now(),
                providerConfigKey,
                connectionId
            });

            this.runningCredentialsRefreshes.push(refresh);

            return promise;
        }

        // All good, no refresh needed
        return credentials;
    }
}

export default new ConnectionService();
