import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import {
    createActivityLog,
    createActivityLogMessage,
    createActivityLogMessageAndEnd,
    updateProvider as updateProviderActivityLog,
    updateSuccess as updateSuccessActivityLog,
    Config as ProviderConfig,
    Template as ProviderTemplate,
    AuthModes as ProviderAuthModes,
    TemplateOAuth2 as ProviderTemplateOAuth2,
    Connection,
    LogLevel,
    LogAction,
    HTTP_VERB,
    configService,
    connectionService,
    getAccount,
    errorManager,
    analytics
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
                provider_config_key: providerConfigKey as string,
                account_id: account.id
            };

            const activityLogId = await createActivityLog(log);

            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: `Token fetch was successful for ${providerConfigKey} and connection ${connectionId} from the web UI`
            });

            if (connectionId == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: WSErrBuilder.MissingConnectionId().message
                });

                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (providerConfigKey == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: WSErrBuilder.MissingProviderConfigKey().message
                });

                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const connection: Connection | null = await connectionService.getConnection(connectionId, providerConfigKey, account.id);

            if (connection == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: 'Unknown connection'
                });

                errorManager.errRes(res, 'unkown_connection');
                return;
            }

            const config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, account.id);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: 'Unknown provider config'
                });

                errorManager.errRes(res, 'unknown_provider_config');
                return;
            }

            await updateProviderActivityLog(activityLogId as number, config.provider);

            const template: ProviderTemplate | undefined = configService.getTemplate(config.provider);

            if (connection.credentials.type === ProviderAuthModes.OAuth2) {
                connection.credentials = await connectionService.refreshOauth2CredentialsIfNeeded(
                    connection,
                    config,
                    template as ProviderTemplateOAuth2,
                    activityLogId,
                    false,
                    'token' as LogAction
                );
            }

            await updateSuccessActivityLog(activityLogId as number, true);

            if (instantRefresh) {
                await createActivityLogMessageAndEnd({
                    level: 'info',
                    activity_log_id: activityLogId as number,
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
            let account = (await getUserAndAccountFromSession(req)).account;

            let connections = await connectionService.listConnections(account.id);

            let configs = await configService.listProviderConfigs(account.id);

            if (configs == null) {
                res.status(200).send({ connections: [] });
            }

            let uniqueKeyToProvider: { [key: string]: string } = {};
            let providerConfigKeys = configs.map((config: ProviderConfig) => config.unique_key);

            providerConfigKeys.forEach((key: string, i: number) => (uniqueKeyToProvider[key] = configs[i]!.provider));

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
            const instantRefresh = req.query['force_refresh'] === 'true';

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

            const activityLogId = await createActivityLog(log);
            const connection = await connectionService.getConnectionCredentials(
                res,
                connectionId,
                providerConfigKey,
                activityLogId as number,
                action,
                instantRefresh
            );

            await createActivityLogMessageAndEnd({
                level: 'info',
                activity_log_id: activityLogId as number,
                timestamp: Date.now(),
                content: 'Connection credentials found successfully',
                params: {
                    instant_refresh: instantRefresh
                }
            });

            res.status(200).send(connection);
        } catch (err) {
            next(err);
        }
    }

    async listConnections(req: Request, res: Response, next: NextFunction) {
        try {
            let accountId = getAccount(res);
            const { connectionId } = req.query;
            let connections: Object[] = await connectionService.listConnections(accountId, connectionId as string);

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

            res.status(200).send();
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
