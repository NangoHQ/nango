import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import {
    createActivityLog,
    createActivityLogMessageAndEnd,
    Config as ProviderConfig,
    Template as ProviderTemplate,
    AuthModes as ProviderAuthModes,
    ImportedCredentials,
    TemplateOAuth2 as ProviderTemplateOAuth2,
    Connection,
    LogLevel,
    LogAction,
    HTTP_VERB,
    configService,
    connectionService,
    getAccount,
    errorManager,
    analytics,
    createActivityLogAndLogMessage
} from '@nangohq/shared';
import { getUserAndAccountFromSession } from '../utils/utils.js';
import { WSErrBuilder } from '../utils/web-socket-error.js';

class ConnectionController {
    /**
     * Webapp
     */

    async getConnectionWeb(req: Request, res: Response, next: NextFunction) {
        try {
            const account = (await getUserAndAccountFromSession(req)).account;

            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;
            const instantRefresh = req.query['force_refresh'] === 'true';

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action: 'token' as LogAction,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: connectionId as string,
                provider: '',
                provider_config_key: providerConfigKey as string,
                account_id: account.id
            };

            if (connectionId == null) {
                await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    timestamp: Date.now(),
                    content: WSErrBuilder.MissingConnectionId().message
                });

                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    timestamp: Date.now(),
                    content: WSErrBuilder.MissingProviderConfigKey().message
                });

                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, account.id);

            if (connection == null) {
                await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    timestamp: Date.now(),
                    content: 'Unknown connection'
                });

                errorManager.errRes(res, 'unkown_connection');
                return;
            }

            const config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, account.id);

            if (config == null) {
                await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    timestamp: Date.now(),
                    content: 'Unknown provider config'
                });

                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            const template: ProviderTemplate | undefined = configService.getTemplate(config.provider);

            if (connection.credentials.type === ProviderAuthModes.OAuth2) {
                connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(
                    connection,
                    config,
                    template as ProviderTemplateOAuth2,
                    null,
                    false,
                    'token' as LogAction
                );
            }

            if (instantRefresh) {
                log.provider = config.provider;
                log.success = true;

                await createActivityLogAndLogMessage(log, {
                    level: 'info',
                    auth_mode: template?.auth_mode,
                    content: `Token manual refresh fetch was successful for ${providerConfigKey} and connection ${connectionId} from the web UI`,
                    timestamp: Date.now()
                });
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
            const account = (await getUserAndAccountFromSession(req)).account;

            const connections = await connectionService.listConnections(account.id);

            const configs = await configService.listProviderConfigs(account.id);

            if (configs == null) {
                res.status(200).send({ connections: [] });
            }

            const uniqueKeyToProvider: { [key: string]: string } = {};
            const providerConfigKeys = configs.map((config: ProviderConfig) => config.unique_key);

            providerConfigKeys.forEach((key: string, i: number) => (uniqueKeyToProvider[key] = configs[i]!.provider));

            const result = connections.map((connection) => {
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
            const account = (await getUserAndAccountFromSession(req)).account;
            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;

            if (connectionId == null) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, account.id);

            if (connection == null) {
                errorManager.errRes(res, 'unkown_connection');
                return;
            }

            await connectionService.deleteConnection(connection, providerConfigKey, account.id);

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
            const accountId = getAccount(res);
            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;
            const returnRefreshToken = ((req.query['refresh_token'] === 'true') as boolean) || false;
            const instantRefresh = req.query['force_refresh'] === 'true';
            const isSync = req.get('Nango-Is-Sync') as string;
            const isDryRun = req.get('Nango-Is-Dry-Run') as string;

            let activityLogId: number | null = null;

            const action: LogAction = 'token';
            const log = {
                level: 'debug' as LogLevel,
                success: true,
                action,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                method: req.method as HTTP_VERB,
                connection_id: connectionId as string,
                provider_config_key: providerConfigKey as string,
                account_id: accountId
            };

            if (!isSync && !isDryRun) {
                activityLogId = await createActivityLog(log);
            }

            const connection = await connectionService.getConnectionCredentials(res, connectionId, providerConfigKey, activityLogId, action, instantRefresh);

            if (!isSync && !isDryRun) {
                await createActivityLogMessageAndEnd({
                    level: 'info',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: 'Connection credentials found successfully',
                    params: {
                        instant_refresh: instantRefresh
                    }
                });
            }

            if (connection && !returnRefreshToken && connection.credentials.type === ProviderAuthModes.OAuth2) {
                delete connection.credentials.refresh_token;
                delete connection.credentials.raw['refresh_token'];
            }

            res.status(200).send(connection);
        } catch (err) {
            next(err);
        }
    }

    async listConnections(req: Request, res: Response, next: NextFunction) {
        try {
            const accountId = getAccount(res);
            const { connectionId } = req.query;
            const connections: Object[] = await connectionService.listConnections(accountId, connectionId as string);

            analytics.track('server:connection_list_fetched', accountId);

            res.status(200).send({ connections: connections });
        } catch (err) {
            next(err);
        }
    }

    async deleteConnection(req: Request, res: Response, next: NextFunction) {
        try {
            const accountId = getAccount(res);
            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;

            if (connectionId == null) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, accountId);

            if (connection == null) {
                errorManager.errRes(res, 'unkown_connection');
                return;
            }

            await connectionService.deleteConnection(connection, providerConfigKey, accountId);

            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }

    async listProviders(_: Request, res: Response, next: NextFunction) {
        try {
            const providers = Object.entries(configService.getTemplates())
                .map((providerProperties: [string, ProviderTemplate]) => {
                    const [provider, properties] = providerProperties;
                    return {
                        name: provider,
                        defaultScopes: properties.default_scopes
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
            res.status(200).send(providers);
        } catch (err) {
            next(err);
        }
    }

    async setFieldMapping(req: Request, res: Response, next: NextFunction) {
        try {
            const accountId = getAccount(res);
            const connectionId = (req.params['connectionId'] as string) || (req.get('Connection-Id') as string);
            const providerConfigKey = (req.params['provider_config_key'] as string) || (req.get('Provider-Config-Key') as string);

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, accountId);

            if (!connection) {
                errorManager.errRes(res, 'unknown_connection');
                return;
            }

            await connectionService.updateFieldMappings(connection, req.body);

            res.status(201).send();
        } catch (err) {
            next(err);
        }
    }

    async createConnection(req: Request, res: Response, next: NextFunction) {
        try {
            const accountId = getAccount(res);

            const { connection_id, provider_config_key, type } = req.body;

            if (!connection_id) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (!provider_config_key) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            if (!type) {
                errorManager.errRes(res, 'missing_oauth_type');
                return;
            }

            const oauthType = type.toUpperCase();
            let credentials: ImportedCredentials;

            if (oauthType === ProviderAuthModes.OAuth2) {
                const { access_token, refresh_token, expires_at, expires_in, metadata, connection_config } = req.body;
                credentials = {
                    type: oauthType as ProviderAuthModes.OAuth2,
                    access_token,
                    refresh_token,
                    expires_at,
                    expires_in,
                    metadata,
                    connection_config,
                    raw: req.body.raw || req.body
                };
            } else if (oauthType === ProviderAuthModes.OAuth1) {
                const { oauth_token, oauth_token_secret } = req.body;

                if (!oauth_token) {
                    errorManager.errRes(res, 'missing_oauth_token');
                    return;
                }

                if (!oauth_token_secret) {
                    errorManager.errRes(res, 'missing_oauth_token_secret');
                    return;
                }

                credentials = {
                    type: oauthType as ProviderAuthModes.OAuth1,
                    oauth_token,
                    oauth_token_secret,
                    raw: req.body.raw || req.body
                };
            } else {
                errorManager.errRes(res, 'unknown_oauth_type');
                return;
            }

            await connectionService.importConnection(connection_id, provider_config_key, accountId, credentials);

            res.status(201).send(req.body);
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
