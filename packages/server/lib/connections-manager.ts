import type { PizzlyAuthCredentials, PizzlyOAuth2Credentials, PizzlyIntegrationConfig, PizzlyIntegrationTemplate, PizzlyCredentialsRefresh } from './types.js';
import { PizzlyIntegrationAuthModes } from './types.js';
import { refreshOAuth2Credentials } from './oauth-clients.js';

class ConnectionsManager {
    private runningCredentialsRefreshes: PizzlyCredentialsRefresh[] = [];

    public insertOrUpdateConnection(connectionId: string, integration: string, credentials: object, authMode: PizzlyIntegrationAuthModes) {
        console.log(connectionId);
        console.log(integration);
        console.log(credentials);
        console.log(authMode);
        // TODO: fill out
    }

    public updateConnectionCredentials(connectionId: string, integration: string, credentials: object, authMode: PizzlyIntegrationAuthModes) {
        console.log(connectionId);
        console.log(integration);
        console.log(credentials);
        console.log(authMode);
        // TODO: fill out
    }

    public updateConnectionConfig(connectionId: string, integration: string, additionalConfig: Record<string, unknown>) {
        console.log(connectionId);
        console.log(integration);
        console.log(additionalConfig);
        // TODO: fill out
    }

    public insertConnection(
        connectionId: string,
        integration: string,
        credentials: object,
        authMode: PizzlyIntegrationAuthModes,
        additionalConfig?: Record<string, unknown>
    ) {
        console.log(connectionId);
        console.log(integration);
        console.log(credentials);
        console.log(authMode);
        console.log(additionalConfig);
        // TODO: fill out
    }

    public getConnection(connectionId: string, integration: string) {
        // TODO: should return PizzlyConnection | undefined
        console.log(connectionId);
        console.log(integration);
        // TODO: fill out
    }

    public getConnectionsForUserId(connectionId: string) {
        // TODO: should return PizzlyConnection[]
        console.log(connectionId);
        // TODO: fill out
    }

    public getConnectionsForIntegration(integration: string) {
        // TODO: should return PizzlyConnection[]
        console.log(integration);
        // TODO: fill out
    }

    // Parses and arbitrary object (e.g. a server response or a user provided auth object) into PizzlyAuthCredentials.
    // Throws if values are missing/missing the input is malformed.
    public parseRawCredentials(rawCredentials: object, authMode: PizzlyIntegrationAuthModes): PizzlyAuthCredentials {
        const rawAuthCredentials = rawCredentials as Record<string, any>; // Otherwise TS complains

        let parsedCredentials: any = {};
        switch (authMode) {
            case PizzlyIntegrationAuthModes.OAuth2:
                parsedCredentials.type = PizzlyIntegrationAuthModes.OAuth2;
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
            case PizzlyIntegrationAuthModes.OAuth1:
                parsedCredentials.type = PizzlyIntegrationAuthModes.OAuth1;
                parsedCredentials.oAuthToken = rawAuthCredentials['oauth_token'];
                parsedCredentials.oAuthTokenSecret = rawAuthCredentials['oauth_token_secret'];
                break;
            case PizzlyIntegrationAuthModes.ApiKey:
                parsedCredentials.type = PizzlyIntegrationAuthModes.ApiKey;
                parsedCredentials.apiKey = rawAuthCredentials['api_key'];
                break;
            case PizzlyIntegrationAuthModes.UsernamePassword:
                parsedCredentials.type = PizzlyIntegrationAuthModes.UsernamePassword;
                parsedCredentials.username = rawAuthCredentials['username'];
                parsedCredentials.password = rawAuthCredentials['password'];
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
        credentials: PizzlyOAuth2Credentials,
        userId: string,
        integration: string,
        integrationConfig: PizzlyIntegrationConfig,
        integrationTemplate: PizzlyIntegrationTemplate
    ): Promise<PizzlyOAuth2Credentials> {
        // Check if a refresh is already running for this user & integration
        // If it is wait for that to complete
        let runningRefresh: PizzlyCredentialsRefresh | undefined = undefined;
        for (const refresh of this.runningCredentialsRefreshes) {
            if (refresh.userId === userId && refresh.integration === integration) {
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
                const promise = new Promise<PizzlyOAuth2Credentials>(async (resolve, reject) => {
                    try {
                        const newCredentials = await refreshOAuth2Credentials(credentials, integrationConfig, integrationTemplate);

                        this.updateConnectionCredentials(userId, integration, newCredentials.raw, PizzlyIntegrationAuthModes.OAuth2);

                        // Remove ourselves from the array of running refreshes
                        this.runningCredentialsRefreshes = this.runningCredentialsRefreshes.filter((value) => {
                            return !(value.integration === integration && value.userId === userId);
                        });

                        resolve(newCredentials);
                    } catch (e) {
                        reject(e);
                    }
                });

                const refresh = {
                    userId: userId,
                    integration: integration,
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
            case PizzlyIntegrationAuthModes.OAuth2:
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
            case PizzlyIntegrationAuthModes.OAuth1:
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
            case PizzlyIntegrationAuthModes.ApiKey:
                if (!rawAuthCredentials.apiKey) {
                    throw new Error(
                        `Cannot parse credentials, ApiKey credentials must have "api_key" property: ${JSON.stringify(rawAuthCredentials, undefined, 2)}`
                    );
                }
                break;
            case PizzlyIntegrationAuthModes.UsernamePassword:
                if (!rawAuthCredentials.username || !rawAuthCredentials.password) {
                    throw new Error(
                        `Cannot parse credentials, Username & password credentials must have both "username" and "password" property: ${JSON.stringify(
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

export default new ConnectionsManager();
