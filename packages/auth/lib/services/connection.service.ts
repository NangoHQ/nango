import type { AuthCredentials, OAuth2Credentials, ProviderTemplate, CredentialsRefresh } from '../models.js';
import { ProviderAuthModes } from '../models.js';
import { refreshOAuth2Credentials } from '../oauth-clients/oauth2.client.js';
import db from '../db/database.js';
import type { ProviderConfig, Connection } from '../models.js';
import analytics from '../utils/analytics.js';

class ConnectionService {
    private runningCredentialsRefreshes: CredentialsRefresh[] = [];

    public async upsertConnection(
        connectionId: string,
        providerConfigKey: string,
        provider: string,
        rawCredentials: object,
        authMode: ProviderAuthModes,
        connectionConfig: Record<string, string>
    ) {
        await db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .insert({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: this.parseRawCredentials(rawCredentials, authMode),
                connection_config: connectionConfig
            })
            .onConflict(['provider_config_key', 'connection_id'])
            .merge();
        analytics.track('server:connection_upserted', { provider: provider, connection: analytics.hash(connectionId) });
    }

    public async updateConnection(connectionId: string, providerConfigKey: string, credentials: OAuth2Credentials) {
        await db.knex
            .withSchema(db.schema())
            .from<Connection>(`_nango_connections`)
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey })
            .update({
                credentials: credentials
            });
    }

    async getConnection(connectionId: string, providerConfigKey: string): Promise<Connection | null> {
        let result: Connection[] | null = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<Connection>(`_nango_connections`)
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey });

        return result == null || result.length == 0 ? null : result[0] || null;
    }

    // Parses and arbitrary object (e.g. a server response or a user provided auth object) into AuthCredentials.
    // Throws if values are missing/missing the input is malformed.
    public parseRawCredentials(rawCredentials: object, authMode: ProviderAuthModes): AuthCredentials {
        const rawAuthCredentials = rawCredentials as Record<string, any>; // Otherwise TS complains

        let parsedCredentials: any = {};
        switch (authMode) {
            case ProviderAuthModes.OAuth2:
                parsedCredentials.type = ProviderAuthModes.OAuth2;
                parsedCredentials.access_token = rawAuthCredentials['access_token'];

                if (rawAuthCredentials['refresh_token']) {
                    parsedCredentials.refresh_token = rawAuthCredentials['refresh_token'];
                }

                let tokenExpirationDate: Date;
                if (rawAuthCredentials['expires_at']) {
                    tokenExpirationDate = this.parseTokenExpirationDate(rawAuthCredentials['expires_at']);
                } else if (rawAuthCredentials['expires_in']) {
                    tokenExpirationDate = new Date(Date.now() + Number.parseInt(rawAuthCredentials['expires_in'], 10) * 1000);
                } else {
                    throw new Error(`Got a refresh token but no information about expiration: ${JSON.stringify(rawAuthCredentials, undefined, 2)}`);
                }

                parsedCredentials.expires_at = tokenExpirationDate;

                break;
            case ProviderAuthModes.OAuth1:
                parsedCredentials.type = ProviderAuthModes.OAuth1;
                parsedCredentials.oauth_token = rawAuthCredentials['oauth_token'];
                parsedCredentials.oauth_token_secret = rawAuthCredentials['oauth_token_secret'];
                break;
            default:
                throw new Error(`Cannot parse credentials, unknown credentials type: ${JSON.stringify(rawAuthCredentials, undefined, 2)}`);
        }
        parsedCredentials.raw = rawAuthCredentials;

        // Checks if the credentials are well formed, if not it will throw
        const parsedAuthCredentials = this.checkCredentials(parsedCredentials);

        return parsedAuthCredentials;
    }

    // Checks if the OAuth2 credentials need to be refreshed and refreshes them if neccessary.
    // If credentials get refreshed it also updates the user's connection object.
    // Once the refresh or check is complete the new/old credentials are returned, always use these moving forward
    public async refreshOauth2CredentialsIfNeeded(
        connection: Connection,
        providerConfig: ProviderConfig,
        template: ProviderTemplate
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

        // Check if we need to refresh the credentials
        if (credentials.refresh_token && credentials.expires_at) {
            // Check if the expiration is less than 15 minutes away (or has already happened): If so, refresh
            let expireDate = new Date(credentials.expires_at);
            let currDate = new Date();
            let dateDiffMs = expireDate.getTime() - currDate.getTime();
            if (dateDiffMs < 15 * 60 * 1000) {
                const promise = new Promise<OAuth2Credentials>(async (resolve, reject) => {
                    try {
                        const newCredentials = await refreshOAuth2Credentials(connection, providerConfig, template);
                        this.updateConnection(connectionId, providerConfigKey, newCredentials);

                        // Remove ourselves from the array of running refreshes
                        this.runningCredentialsRefreshes = this.runningCredentialsRefreshes.filter((value) => {
                            return !(value.providerConfigKey === providerConfigKey && value.connectionId === connectionId);
                        });

                        resolve(newCredentials);
                    } catch (e) {
                        reject(e);
                    }
                });

                const refresh = {
                    connectionId: connectionId,
                    providerConfigKey: providerConfigKey,
                    promise: promise
                } as CredentialsRefresh;

                this.runningCredentialsRefreshes.push(refresh);

                return promise;
            }
        }

        // All good, no refresh needed
        return credentials;
    }

    /** -------------------- Private Methods -------------------- */

    // private parseCredentials(rawCredentials: string): AuthCredentials {
    //     const credentialsObj = parseJsonDateAware(rawCredentials);
    //     return credentialsObj as AuthCredentials;
    // }

    private checkCredentials(rawCredentials: object): AuthCredentials {
        const rawAuthCredentials = rawCredentials as AuthCredentials;
        if (!rawAuthCredentials.type) {
            throw new Error(`Cannot parse credentials, has no property "type" which is required: ${JSON.stringify(rawAuthCredentials, undefined, 2)}`);
        }

        switch (rawAuthCredentials.type) {
            case ProviderAuthModes.OAuth2:
                if (!rawAuthCredentials.access_token) {
                    throw new Error(
                        `Cannot parse credentials, OAuth2 access token credentials must have "access_token" property: ${JSON.stringify(
                            rawAuthCredentials,
                            undefined,
                            2
                        )}`
                    );
                } else if (rawAuthCredentials.refresh_token && !rawAuthCredentials.expires_at) {
                    throw new Error(
                        `Cannot parse credentials, if OAuth2 access token credentials have a "refresh_token" property the "expires_at" property must also be set: ${JSON.stringify(
                            rawAuthCredentials,
                            undefined,
                            2
                        )}`
                    );
                }
                break;
            case ProviderAuthModes.OAuth1:
                if (!rawAuthCredentials.oauth_token || !rawAuthCredentials.oauth_token_secret) {
                    throw new Error(
                        `Cannot parse credentials, OAuth1 credentials must have both "oauth_token" and "oauth_token_secret" property: ${JSON.stringify(
                            rawAuthCredentials,
                            undefined,
                            2
                        )}`
                    );
                }
                break;
            default:
                throw new Error(`Cannot parse credentials, unknown credentials type: ${JSON.stringify(rawAuthCredentials, undefined, 2)}`);
        }

        return rawAuthCredentials;
    }

    private parseTokenExpirationDate(expirationDate: any): Date {
        if (expirationDate instanceof Date) {
            return expirationDate;
        }

        // UNIX timestamp
        if (typeof expirationDate === 'number') {
            return new Date(expirationDate * 1000);
        }

        // ISO 8601 string
        return new Date(expirationDate);
    }
}

export default new ConnectionService();
