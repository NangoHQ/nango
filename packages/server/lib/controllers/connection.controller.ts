import type { Request, Response } from 'express';
import connectionService from '../services/connection.service.js';
import type { NextFunction } from 'express';
import configService from '../services/config.service.js';
import { ProviderConfig, ProviderTemplate, Connection, ProviderAuthModes, ProviderTemplateOAuth2 } from '../models.js';
import analytics from '../utils/analytics.js';
import { getAccount, getUserAndAccountFromSession } from '../utils/utils.js';
import errorManager from '../utils/error.manager.js';

class ConnectionController {
    /**
     * Webapp
     */

    async getConnectionWeb(req: Request, res: Response, next: NextFunction) {
        try {
            let account = (await getUserAndAccountFromSession(req)).account;

            let connectionId = req.params['connectionId'] as string;
            let providerConfigKey = req.query['provider_config_key'] as string;

            if (connectionId == null) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            let connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, account.id);

            if (connection == null) {
                errorManager.errRes(res, 'unkown_connection');
                return;
            }

            let config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, account.id);

            if (config == null) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            let template: ProviderTemplate | undefined = configService.getTemplate(config.provider);

            if (connection.credentials.type === ProviderAuthModes.OAuth2) {
                connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(connection, config, template as ProviderTemplateOAuth2);
            }

            res.status(200).send({
                connection: {
                    id: connection.id,
                    connectionId: connection.connection_id,
                    provider: config.provider,
                    providerConfigKey: connection.provider_config_key,
                    creationDate: connection.created_at,
                    oauthType: connection.credentials.type,
                    connectionConfig: connection.connection_config,
                    connectionMetadata: connection.metadata,
                    accessToken: connection.credentials.type === ProviderAuthModes.OAuth2 ? connection.credentials.access_token : null,
                    refreshToken: connection.credentials.type === ProviderAuthModes.OAuth2 ? connection.credentials.refresh_token : null,
                    expiresAt: connection.credentials.type === ProviderAuthModes.OAuth2 ? connection.credentials.expires_at : null,
                    oauthToken: connection.credentials.type === ProviderAuthModes.OAuth1 ? connection.credentials.oauth_token : null,
                    oauthTokenSecret: connection.credentials.type === ProviderAuthModes.OAuth1 ? connection.credentials.oauth_token_secret : null,
                    rawCredentials: connection.credentials.raw
                }
            });
        } catch (err) {
            next(err);
        }
    }

    async getConnectionsWeb(req: Request, res: Response, next: NextFunction) {
        try {
            let account = (await getUserAndAccountFromSession(req)).account;

            let connections = await connectionService.listConnections(account.id);

            let configs = await configService.listProviderConfigs(account.id);

            if (configs == null) {
                res.status(200).send({ connections: [] });
            }

            let uniqueKeyToProvider: { [key: string]: string } = {};
            let providerConfigKeys = configs.map((config) => config.unique_key);

            providerConfigKeys.forEach((key, i) => (uniqueKeyToProvider[key] = configs[i]!.provider));

            let result = connections.map((connection) => {
                return {
                    id: connection.id,
                    connectionId: connection.connection_id,
                    providerConfigKey: connection.provider,
                    provider: uniqueKeyToProvider[connection.provider],
                    creationDate: connection.created
                };
            });

            res.status(200).send({
                connections: result.sort(function (a, b) {
                    return new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime();
                })
            });
        } catch (err) {
            next(err);
        }
    }

    async deleteConnectionWeb(req: Request, res: Response, next: NextFunction) {
        try {
            let account = (await getUserAndAccountFromSession(req)).account;
            let connectionId = req.params['connectionId'] as string;
            let providerConfigKey = req.query['provider_config_key'] as string;

            if (connectionId == null) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            let connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, account.id);

            if (connection == null) {
                errorManager.errRes(res, 'unkown_connection');
                return;
            }

            await connectionService.deleteConnection(connection.connection_id, providerConfigKey, account.id);

            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    /**
     * CLI/SDK/API
     */

    async getConnectionCreds(req: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccount(res);
            let connectionId = req.params['connectionId'] as string;
            let providerConfigKey = req.query['provider_config_key'] as string;
            const instantRefresh = req.query['force_refresh'] === 'true'; // This allows us to instantly refresh the token instead of waiting for the token to expire
            if (connectionId == null) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            let connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, accountId);

            if (connection == null) {
                errorManager.errRes(res, 'unkown_connection');
                return;
            }

            let config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, accountId);

            if (config == null) {
                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            let template: ProviderTemplate | undefined = configService.getTemplate(config.provider);

            if (connection.credentials.type === ProviderAuthModes.OAuth2) {
                connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(
                    connection,
                    config,
                    template as ProviderTemplateOAuth2,
                    instantRefresh
                );
            }

            analytics.track('server:connection_fetched', accountId, { provider: config.provider });

            res.status(200).send(connection);
        } catch (err) {
            next(err);
        }
    }

    async listConnections(_: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccount(res);
            let connections: Object[] = await connectionService.listConnections(accountId);

            analytics.track('server:connection_list_fetched', accountId);

            res.status(200).send({ connections: connections });
        } catch (err) {
            next(err);
        }
    }

    async deleteConnection(req: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccount(res);
            let connectionId = req.params['connectionId'] as string;
            let providerConfigKey = req.query['provider_config_key'] as string;

            if (connectionId == null) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            let connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, accountId);

            if (connection == null) {
                errorManager.errRes(res, 'unkown_connection');
                return;
            }

            await connectionService.deleteConnection(connection.connection_id, providerConfigKey, accountId);

            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async listProviders(_: Request, res: Response, next: NextFunction) {
        try {
            const providers = Object.entries(configService.getTemplates())
                .map((providerProperties) => {
                    const [provider, properties] = providerProperties;
                    return {
                        name: provider,
                        defaultScope: properties.default_scopes?.join(',')
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
            res.status(200).send(providers);
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
