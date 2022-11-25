import type { PizzlyAuthCredentials, OAuth2Credentials, IntegrationTemplate, PizzlyCredentialsRefresh } from '../models.js';
import { IntegrationAuthModes } from '../models.js';
import { refreshOAuth2Credentials } from '../oauth-clients/oauth2.client.js';
import db from '../db/database.js';
import type { IntegrationConfig, Connection } from '../models.js';

class ConnectionService {
    private runningCredentialsRefreshes: PizzlyCredentialsRefresh[] = [];

    public async upsertConnection(connectionId: string, integrationKey: string, rawCredentials: object, authMode: IntegrationAuthModes) {
        let connection = await this.getConnection(connectionId, integrationKey);
        if (connection == null) {
            await db.knex
                .withSchema(db.schema())
                .insert({
                    connection_id: connectionId,
                    integration_key: integrationKey,
                    credentials: this.parseRawCredentials(rawCredentials, authMode),
                    raw_response: rawCredentials
                })
                .into<Connection>(`_pizzly_connections`);
        } else {
            await db.knex
                .withSchema(db.schema())
                .from<Connection>(`_pizzly_connections`)
                .where({ connection_id: connectionId, integration_key: integrationKey })
                .update({
                    credentials: this.parseRawCredentials(rawCredentials, authMode),
                    raw_response: rawCredentials
                });
        }
    }

    async getConnection(connectionId: string, integrationKey: string): Promise<Connection | null> {
        let result: Connection[] | null = await db.knex
            .withSchema(db.schema())
            .select('*')
            .from<Connection>(`_pizzly_connections`)
            .where({ connection_id: connectionId, integration_key: integrationKey });

        return result == null || result.length == 0 ? null : result[0] || null;
    }

    // Parses and arbitrary object (e.g. a server response or a user provided auth object) into PizzlyAuthCredentials.
    // Throws if values are missing/missing the input is malformed.
    public parseRawCredentials(rawCredentials: object, authMode: IntegrationAuthModes): PizzlyAuthCredentials {
        const rawAuthCredentials = rawCredentials as Record<string, any>; // Otherwise TS complains

        let parsedCredentials: any = {};
        switch (authMode) {
            case IntegrationAuthModes.OAuth2:
                parsedCredentials.type = IntegrationAuthModes.OAuth2;
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
            case IntegrationAuthModes.OAuth1:
                parsedCredentials.type = IntegrationAuthModes.OAuth1;
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
        credentials: OAuth2Credentials,
        connectionId: string,
        integrationKey: string,
        integrationConfig: IntegrationConfig,
        integrationTemplate: IntegrationTemplate
    ): Promise<OAuth2Credentials> {
        // Check if a refresh is already running for this user & integration
        // If it is wait for that to complete
        let runningRefresh: PizzlyCredentialsRefresh | undefined = undefined;
        for (const refresh of this.runningCredentialsRefreshes) {
            if (refresh.connectionId === connectionId && refresh.integrationKey === integrationKey) {
                runningRefresh = refresh;
            }
        }

        if (runningRefresh) {
            return runningRefresh.promise;
        }

        // Check if we need to refresh the credentials
        if (credentials.refreshToken && credentials.expiresAt) {
            const safeExpirationDate = new Date();
            safeExpirationDate.setMinutes(safeExpirationDate.getMinutes() + 15); // Surprisingly this does handle the wraparound correct

            // Check if the expiration is less than 15 minutes away (or has already happened): If so, refresh
            if (credentials.expiresAt < safeExpirationDate) {
                const promise = new Promise<OAuth2Credentials>(async (resolve, reject) => {
                    try {
                        const newCredentials = await refreshOAuth2Credentials(credentials, integrationConfig, integrationTemplate);

                        this.upsertConnection(connectionId, integrationKey, newCredentials.raw, IntegrationAuthModes.OAuth2);

                        // Remove ourselves from the array of running refreshes
                        this.runningCredentialsRefreshes = this.runningCredentialsRefreshes.filter((value) => {
                            return !(value.integrationKey === integrationKey && value.connectionId === connectionId);
                        });

                        resolve(newCredentials);
                    } catch (e) {
                        reject(e);
                    }
                });

                const refresh = {
                    connectionId: connectionId,
                    integrationKey: integrationKey,
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
            case IntegrationAuthModes.OAuth2:
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
            case IntegrationAuthModes.OAuth1:
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
