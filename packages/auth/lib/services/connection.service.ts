import type { PizzlyAuthCredentials, OAuth2Credentials, ProviderTemplate, PizzlyCredentialsRefresh } from '../models.js';
import { ProviderAuthModes } from '../models.js';
import { refreshOAuth2Credentials } from '../oauth-clients/oauth2.client.js';
import db from '../db/database.js';
import type { ProviderConfig, Connection } from '../models.js';

class ConnectionService {
    private runningCredentialsRefreshes: PizzlyCredentialsRefresh[] = [];

    public async upsertConnection(
        connectionId: string,
        providerConfigKey: string,
        rawCredentials: object,
        authMode: ProviderAuthModes,
        connectionConfig: Record<string, string>
    ) {
        await db.knex
            .withSchema(db.schema())
            .from<Connection>(`_pizzly_connections`)
            .insert({
                connection_id: connectionId,
                provider_config_key: providerConfigKey,
                credentials: this.parseRawCredentials(rawCredentials, authMode),
                connection_config: connectionConfig
            })
            .onConflict(['provider_config_key', 'connection_id'])
            .merge();
    }

    public async updateConnection(connectionId: string, providerConfigKey: string, rawCredentials: object, authMode: ProviderAuthModes) {
        await db.knex
            .withSchema(db.schema())
            .from<Connection>(`_pizzly_connections`)
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey })
            .update({
                credentials: this.parseRawCredentials(rawCredentials, authMode)
            });
    }

    async getConnection(connectionId: string, providerConfigKey: string): Promise<Connection | null> {
        let result: Connection[] | null = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<Connection>(`_pizzly_connections`)
            .where({ connection_id: connectionId, provider_config_key: providerConfigKey });

        return result == null || result.length == 0 ? null : result[0] || null;
    }

    // Parses and arbitrary object (e.g. a server response or a user provided auth object) into PizzlyAuthCredentials.
    // Throws if values are missing/missing the input is malformed.
    public parseRawCredentials(rawCredentials: object, authMode: ProviderAuthModes): PizzlyAuthCredentials {
        const rawAuthCredentials = rawCredentials as Record<string, any>; // Otherwise TS complains

        let parsedCredentials: any = {};
        switch (authMode) {
            case ProviderAuthModes.OAuth2:
                parsedCredentials.type = ProviderAuthModes.OAuth2;
                parsedCredentials.accessToken = rawAuthCredentials['access_token'];
                if (rawAuthCredentials['refresh_token']) {
                    parsedCredentials.refreshToken = rawAuthCredentials['refresh_token'];
                    let tokenExpirationDate: Date;
                    if (rawAuthCredentials['expires_at']) {
                        tokenExpirationDate = this.parseTokenExpirationDate(rawAuthCredentials['expires_at']);
                    } else if (rawAuthCredentials['expires_in']) {
                        tokenExpirationDate = new Date(Date.now() + Number.parseInt(rawAuthCredentials['expires_in'], 10) * 1000);
                    } else {
                        throw new Error(`Got a refresh token but no information about expiration: ${JSON.stringify(rawAuthCredentials, undefined, 2)}`);
                    }
                    parsedCredentials.expiresAt = tokenExpirationDate;
                }
                break;
            case ProviderAuthModes.OAuth1:
                parsedCredentials.type = ProviderAuthModes.OAuth1;
                parsedCredentials.oAuthToken = rawAuthCredentials['oauth_token'];
                parsedCredentials.oAuthTokenSecret = rawAuthCredentials['oauth_token_secret'];
                break;
            default:
                throw new Error(`Cannot parse credentials, unknown credentials type: ${JSON.stringify(rawAuthCredentials, undefined, 2)}`);
        }
        parsedCredentials.raw = rawAuthCredentials;

        // Checks if the credentials are well formed, if not it will throw
        const parsedPizzlyAuthCredentials = this.checkCredentials(parsedCredentials);

        return parsedPizzlyAuthCredentials;
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
        let runningRefresh: PizzlyCredentialsRefresh | undefined = undefined;
        for (const refresh of this.runningCredentialsRefreshes) {
            if (refresh.connectionId === connectionId && refresh.providerConfigKey === providerConfigKey) {
                runningRefresh = refresh;
            }
        }

        if (runningRefresh) {
            return runningRefresh.promise;
        }

        // Check if we need to refresh the credentials
        if (credentials.refreshToken && credentials.expiresAt) {
            // Check if the expiration is less than 15 minutes away (or has already happened): If so, refresh
            let expireDate = new Date(credentials.expiresAt);
            let currDate = new Date();
            let dateDiffMs = expireDate.getTime() - currDate.getTime();
            if (dateDiffMs < 15 * 60 * 1000) {
                const promise = new Promise<OAuth2Credentials>(async (resolve, reject) => {
                    try {
                        const newCredentials = await refreshOAuth2Credentials(connection, providerConfig, template);

                        this.updateConnection(connectionId, providerConfigKey, newCredentials.raw, ProviderAuthModes.OAuth2);

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
                } as PizzlyCredentialsRefresh;

                this.runningCredentialsRefreshes.push(refresh);

                return promise;
            }
        }

        // All good, no refresh needed
        return credentials;
    }

    /** -------------------- Private Methods -------------------- */

    // private parseCredentials(rawCredentials: string): PizzlyAuthCredentials {
    //     const credentialsObj = parseJsonDateAware(rawCredentials);
    //     return credentialsObj as PizzlyAuthCredentials;
    // }

    private checkCredentials(rawCredentials: object): PizzlyAuthCredentials {
        const rawAuthCredentials = rawCredentials as PizzlyAuthCredentials;
        if (!rawAuthCredentials.type) {
            throw new Error(`Cannot parse credentials, has no property "type" which is required: ${JSON.stringify(rawAuthCredentials, undefined, 2)}`);
        }

        switch (rawAuthCredentials.type) {
            case ProviderAuthModes.OAuth2:
                if (!rawAuthCredentials.accessToken) {
                    throw new Error(
                        `Cannot parse credentials, OAuth2 access token credentials must have "access_token" property: ${JSON.stringify(
                            rawAuthCredentials,
                            undefined,
                            2
                        )}`
                    );
                } else if (rawAuthCredentials.refreshToken && !rawAuthCredentials.expiresAt) {
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
                if (!rawAuthCredentials.oAuthToken || !rawAuthCredentials.oAuthTokenSecret) {
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
