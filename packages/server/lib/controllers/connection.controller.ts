import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import {
    createActivityLog,
    createActivityLogMessageAndEnd,
    Config as ProviderConfig,
    Template as ProviderTemplate,
    AuthModes as ProviderAuthModes,
    OAuth1Credentials,
    OAuth2Credentials,
    ImportedCredentials,
    TemplateOAuth2 as ProviderTemplateOAuth2,
    getEnvironmentAndAccountId,
    ConnectionList,
    LogLevel,
    LogActionEnum,
    HTTP_VERB,
    configService,
    connectionService,
    getAccount,
    getEnvironmentId,
    errorManager,
    analytics,
    NangoError,
    createActivityLogAndLogMessage,
    environmentService
} from '@nangohq/shared';
import { getUserAccountAndEnvironmentFromSession } from '../utils/utils.js';

class ConnectionController {
    /**
     * Webapp
     */

    async getConnectionWeb(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environment } = response;

            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;
            const instantRefresh = req.query['force_refresh'] === 'true';

            const action = LogActionEnum.TOKEN;

            const log = {
                level: 'info' as LogLevel,
                success: false,
                action,
                start: Date.now(),
                end: Date.now(),
                timestamp: Date.now(),
                connection_id: connectionId as string,
                provider: '',
                provider_config_key: providerConfigKey as string,
                environment_id: environment.id
            };

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (connection == null) {
                await createActivityLogAndLogMessage(log, {
                    level: 'error',
                    timestamp: Date.now(),
                    content: 'Unknown connection'
                });

                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            const config: ProviderConfig | null = await configService.getProviderConfig(connection.provider_config_key, environment.id);

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
                const {
                    success,
                    error,
                    response: credentials
                } = await connectionService.refreshOauth2CredentialsIfNeeded(
                    connection,
                    config,
                    template as ProviderTemplateOAuth2,
                    null,
                    instantRefresh,
                    LogActionEnum.TOKEN
                );

                if (!success) {
                    errorManager.errResFromNangoErr(res, error);
                    return;
                }

                connection.credentials = credentials as OAuth2Credentials;
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

            let rawCredentials = null;
            let credentials = null;

            if (connection.credentials.type === ProviderAuthModes.OAuth1 || connection.credentials.type === ProviderAuthModes.OAuth2) {
                const credentials = connection.credentials as OAuth2Credentials | OAuth1Credentials;
                rawCredentials = credentials.raw;
            }

            if (connection.credentials.type === ProviderAuthModes.Basic || connection.credentials.type === ProviderAuthModes.ApiKey) {
                credentials = connection.credentials;
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
                    credentials,
                    rawCredentials
                }
            });
        } catch (err) {
            next(err);
        }
    }

    async getConnectionsWeb(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getUserAccountAndEnvironmentFromSession(req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { environment } = response;

            const connections = await connectionService.listConnections(environment.id);

            const configs = await configService.listProviderConfigs(environment.id);

            if (configs == null) {
                res.status(200).send({ connections: [] });

                return;
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

    /**
     * CLI/SDK/API
     */

    async getConnectionCreds(req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const accountId = getAccount(res);
            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;
            const returnRefreshToken = req.query['refresh_token'] === 'true';
            const instantRefresh = req.query['force_refresh'] === 'true';
            const isSync = req.get('Nango-Is-Sync') as string;
            const isDryRun = req.get('Nango-Is-Dry-Run') as string;

            let activityLogId: number | null = null;

            const action = LogActionEnum.TOKEN;
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
                environment_id: environmentId
            };

            if (!isSync && !isDryRun) {
                activityLogId = await createActivityLog(log);
            }

            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnectionCredentials(
                accountId,
                environmentId,
                connectionId,
                providerConfigKey,
                activityLogId,
                action,
                instantRefresh
            );

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

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

            if (connection && connection.credentials && connection.credentials.type === ProviderAuthModes.OAuth2 && !returnRefreshToken) {
                if (connection.credentials.refresh_token) {
                    delete connection.credentials.refresh_token;
                }

                if (connection.credentials.raw && connection.credentials.raw['refresh_token']) {
                    const rawCreds = { ...connection.credentials.raw }; // Properties from 'raw' are not mutable so we need to create a new object.
                    delete rawCreds['refresh_token'];
                    connection.credentials.raw = rawCreds;
                }
            }

            res.status(200).send(connection);
        } catch (err) {
            next(err);
        }
    }

    async listConnections(req: Request, res: Response, next: NextFunction) {
        try {
            const { success, error, response } = await getEnvironmentAndAccountId(res, req);
            if (!success || response === null) {
                errorManager.errResFromNangoErr(res, error);
                return;
            }
            const { accountId, environmentId, isWeb } = response;

            const { connectionId } = req.query;
            const connections = await connectionService.listConnections(environmentId, connectionId as string);

            if (!isWeb) {
                analytics.track('server:connection_list_fetched', accountId);
                res.status(200).send({ connections });

                return;
            }

            const configs = await configService.listProviderConfigs(environmentId);

            if (configs == null) {
                res.status(200).send({ connections: [] });

                return;
            }

            const uniqueKeyToProvider: { [key: string]: string } = {};
            const providerConfigKeys = configs.map((config: ProviderConfig) => config.unique_key);

            providerConfigKeys.forEach((key: string, i: number) => (uniqueKeyToProvider[key] = configs[i]!.provider));

            const result: ConnectionList[] = connections.map((connection) => {
                return {
                    id: connection.id,
                    connectionId: connection.connection_id,
                    providerConfigKey: connection.provider as string,
                    provider: uniqueKeyToProvider[connection.provider] as string,
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

    async deleteConnection(req: Request, res: Response, next: NextFunction) {
        try {
            const { success: sessionSuccess, error: sessionError, response } = await getEnvironmentAndAccountId(res, req);
            if (!sessionSuccess || response === null) {
                errorManager.errResFromNangoErr(res, sessionError);
                return;
            }
            const { environmentId } = response;
            const connectionId = req.params['connectionId'] as string;
            const providerConfigKey = req.query['provider_config_key'] as string;

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (connection == null) {
                const environmentName = await environmentService.getEnvironmentName(environmentId);
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            await connectionService.deleteConnection(connection, providerConfigKey, environmentId);

            res.status(204).send();
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
                        defaultScopes: properties.default_scopes,
                        authMode: properties.auth_mode
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));
            res.status(200).send(providers);
        } catch (err) {
            next(err);
        }
    }

    async setMetadata(req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const connectionId = (req.params['connectionId'] as string) || (req.get('Connection-Id') as string);
            const providerConfigKey = (req.params['provider_config_key'] as string) || (req.get('Provider-Config-Key') as string);

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environmentId);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (!connection) {
                const environmentName = await environmentService.getEnvironmentName(environmentId);
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            await connectionService.updateMetadata(connection, req.body);

            res.status(201).send();
        } catch (err) {
            next(err);
        }
    }

    async createConnection(req: Request, res: Response, next: NextFunction) {
        try {
            const environmentId = getEnvironmentId(res);
            const accountId = getAccount(res);

            const { connection_id, provider_config_key } = req.body;

            if (!connection_id) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            if (!provider_config_key) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const provider = await configService.getProviderName(provider_config_key);

            if (!provider) {
                const environmentName = await environmentService.getEnvironmentName(environmentId);
                const error = new NangoError('unknown_provider_config', { providerConfigKey: provider_config_key, environmentName });

                errorManager.errResFromNangoErr(res, error);

                return;
            }

            const template = await configService.getTemplate(provider as string);

            let oAuthCredentials: ImportedCredentials;

            if (template.auth_mode === ProviderAuthModes.OAuth2) {
                const { access_token, refresh_token, expires_at, expires_in, metadata, connection_config } = req.body;

                if (!access_token) {
                    errorManager.errRes(res, 'missing_access_token');
                    return;
                }
                oAuthCredentials = {
                    type: template.auth_mode,
                    access_token,
                    refresh_token,
                    expires_at,
                    expires_in,
                    metadata,
                    connection_config,
                    raw: req.body.raw || req.body
                };

                await connectionService.importOAuthConnection(connection_id, provider_config_key, provider, environmentId, accountId, oAuthCredentials);
            } else if (template.auth_mode === ProviderAuthModes.OAuth1) {
                const { oauth_token, oauth_token_secret } = req.body;

                if (!oauth_token) {
                    errorManager.errRes(res, 'missing_oauth_token');
                    return;
                }

                if (!oauth_token_secret) {
                    errorManager.errRes(res, 'missing_oauth_token_secret');
                    return;
                }

                oAuthCredentials = {
                    type: template.auth_mode,
                    oauth_token,
                    oauth_token_secret,
                    raw: req.body.raw || req.body
                };

                await connectionService.importOAuthConnection(connection_id, provider_config_key, provider, environmentId, accountId, oAuthCredentials);
            } else if (template.auth_mode === ProviderAuthModes.Basic) {
                const { username, password } = req.body;

                if (!username) {
                    errorManager.errRes(res, 'missing_basic_username');
                    return;
                }

                if (!password) {
                    errorManager.errRes(res, 'missing_basic_password');
                    return;
                }

                const credentials = {
                    type: template.auth_mode,
                    username,
                    password
                };

                await connectionService.importApiAuthConnection(connection_id, provider_config_key, provider, environmentId, accountId, credentials);
            } else if (template.auth_mode === ProviderAuthModes.ApiKey) {
                const { api_key: apiKey } = req.body;

                if (!apiKey) {
                    errorManager.errRes(res, 'missing_api_key');
                    return;
                }

                const credentials = {
                    type: template.auth_mode,
                    apiKey
                };

                await connectionService.importApiAuthConnection(connection_id, provider_config_key, provider, environmentId, accountId, credentials);
            } else {
                errorManager.errRes(res, 'unknown_oauth_type');
                return;
            }

            res.status(201).send(req.body);
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
