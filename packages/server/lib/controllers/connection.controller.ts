import type { Request, Response, NextFunction } from 'express';
import type { OAuth2Credentials, AuthCredentials, ConnectionList, ConnectionUpsertResponse } from '@nangohq/shared';
import db from '@nangohq/database';
import type { TbaCredentials, ApiKeyCredentials, BasicApiCredentials, ConnectionConfig, OAuth1Credentials, OAuth2ClientCredentials } from '@nangohq/types';
import { configService, connectionService, errorManager, NangoError, accountService, SlackService, getProvider } from '@nangohq/shared';
import { NANGO_ADMIN_UUID } from './account.controller.js';
import { logContextGetter } from '@nangohq/logs';
import type { RequestLocals } from '../utils/express.js';
import { connectionCreated as connectionCreatedHook, connectionCreationStartCapCheck as connectionCreationStartCapCheckHook } from '../hooks/hooks.js';
import { getOrchestrator } from '../utils/utils.js';
import { preConnectionDeletion } from '../hooks/connection/on/connection-deleted.js';

export type { ConnectionList };

const orchestrator = getOrchestrator();

class ConnectionController {
    async deleteAdminConnection(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment, account: team } = res.locals;
            const connectionId = req.params['connectionId'] as string;

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                return;
            }

            const integration_key = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
            const nangoAdminUUID = NANGO_ADMIN_UUID;
            const env = 'prod';

            const info = await accountService.getAccountAndEnvironmentIdByUUID(nangoAdminUUID as string, env);
            const {
                success,
                error,
                response: connection
            } = await connectionService.getConnection(connectionId, integration_key, info?.environmentId as number);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (connection == null) {
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey: integration_key, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            const preDeletionHook = () =>
                preConnectionDeletion({
                    team,
                    environment,
                    connection,
                    logContextGetter
                });
            await connectionService.deleteConnection({
                connection,
                providerConfigKey: integration_key,
                environmentId: info!.environmentId,
                orchestrator,
                logContextGetter,
                preDeletionHook
            });

            // Kill all notifications associated with this env
            const slackNotificationService = new SlackService({ orchestrator: getOrchestrator(), logContextGetter });
            await slackNotificationService.closeAllOpenNotificationsForEnv(environment.id);

            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    async setMetadataLegacy(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const connectionId = (req.params['connectionId'] as string) || (req.get('Connection-Id') as string);
            const providerConfigKey = (req.query['provider_config_key'] as string) || (req.get('Provider-Config-Key') as string);

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (!connection || !connection.id) {
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            await db.knex.transaction(async (trx) => {
                await connectionService.replaceMetadata([connection.id as number], req.body, trx);
            });

            res.status(201).send(req.body);
        } catch (err) {
            next(err);
        }
    }

    async updateMetadataLegacy(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const environment = res.locals['environment'];
            const connectionId = (req.params['connectionId'] as string) || (req.get('Connection-Id') as string);
            const providerConfigKey = (req.query['provider_config_key'] as string) || (req.get('Provider-Config-Key') as string);

            const { success, error, response: connection } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);

            if (!success) {
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            if (!connection) {
                const error = new NangoError('unknown_connection', { connectionId, providerConfigKey, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);

                return;
            }

            await connectionService.updateMetadata([connection], req.body);

            res.status(200).send(req.body);
        } catch (err) {
            next(err);
        }
    }

    async createConnection(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            const { environment, account } = res.locals;
            const { provider_config_key, metadata, connection_config } = req.body;

            const connectionId = (req.body['connection_id'] as string) || connectionService.generateConnectionId();

            if (!provider_config_key) {
                errorManager.errRes(res, 'missing_provider_config');
                return;
            }

            const integration = await configService.getProviderConfig(provider_config_key, environment.id);
            if (!integration) {
                const error = new NangoError('unknown_provider_config', { providerConfigKey: provider_config_key, environmentName: environment.name });
                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const providerName = integration.provider;

            if (account.is_capped && provider_config_key) {
                const isCapped = await connectionCreationStartCapCheckHook({
                    providerConfigKey: provider_config_key,
                    environmentId: environment.id,
                    creationType: 'import'
                });
                if (isCapped) {
                    errorManager.errRes(res, 'resource_capped');
                    return;
                }
            }

            const provider = getProvider(providerName);
            if (!provider) {
                res.status(404).send({ error: { code: 'unknown_provider_template' } });
                return;
            }

            let updatedConnection: ConnectionUpsertResponse | undefined;

            let runHook = false;

            if (provider.auth_mode === 'OAUTH2') {
                const { access_token, refresh_token, expires_at, expires_in, no_expiration: noExpiration } = req.body;

                const { expires_at: parsedExpiresAt } = connectionService.parseRawCredentials(
                    { access_token, refresh_token, expires_at, expires_in },
                    provider.auth_mode
                ) as OAuth2Credentials;

                if (!access_token) {
                    errorManager.errRes(res, 'missing_access_token');
                    return;
                }

                if (!parsedExpiresAt && noExpiration !== true) {
                    errorManager.errRes(res, 'missing_expires_at');
                    return;
                }

                if (parsedExpiresAt && isNaN(parsedExpiresAt.getTime())) {
                    errorManager.errRes(res, 'invalid_expires_at');
                    return;
                }

                const oAuthCredentials: OAuth2Credentials = {
                    type: provider.auth_mode,
                    access_token,
                    refresh_token,
                    expires_at: expires_at || parsedExpiresAt,
                    raw: req.body.raw || req.body
                };
                const connectionConfig: ConnectionConfig = { ...connection_config };

                if (req.body['oauth_client_id_override']) {
                    oAuthCredentials.config_override = {
                        client_id: req.body['oauth_client_id_override']
                    };
                }

                if (req.body['oauth_client_secret_override']) {
                    oAuthCredentials.config_override = {
                        ...oAuthCredentials.config_override,
                        client_secret: req.body['oauth_client_secret_override']
                    };
                }

                if (connectionConfig['oauth_scopes_override']) {
                    const scopesOverride = connectionConfig['oauth_scopes_override'];
                    connectionConfig['oauth_scopes_override'] = !Array.isArray(scopesOverride) ? scopesOverride.split(',') : scopesOverride;
                }

                const connCreatedHook = (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            connection: res.connection,
                            environment,
                            account,
                            auth_mode: 'OAUTH2',
                            operation: res.operation,
                            endUser: undefined
                        },
                        providerName,
                        logContextGetter
                    );
                };

                const [imported] = await connectionService.importOAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    metadata,
                    environment,
                    account,
                    connectionConfig,
                    parsedRawCredentials: oAuthCredentials,
                    connectionCreatedHook: connCreatedHook
                });

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (provider.auth_mode === 'OAUTH2_CC') {
                const { access_token, oauth_client_id_override, oauth_client_secret_override, expires_at } = req.body;

                if (!access_token) {
                    errorManager.errRes(res, 'missing_access_token');
                    return;
                }

                const { expires_at: parsedExpiresAt } = connectionService.parseRawCredentials(
                    { access_token, expires_at },
                    provider.auth_mode
                ) as OAuth2ClientCredentials;

                if (parsedExpiresAt && isNaN(parsedExpiresAt.getTime())) {
                    errorManager.errRes(res, 'invalid_expires_at');
                    return;
                }

                const oAuthCredentials: OAuth2ClientCredentials = {
                    type: provider.auth_mode,
                    token: access_token,
                    expires_at: parsedExpiresAt,
                    client_id: oauth_client_id_override,
                    client_secret: oauth_client_secret_override,
                    raw: req.body.raw || req.body
                };

                const connectionConfig: ConnectionConfig = { ...connection_config };

                if (connectionConfig['oauth_scopes_override']) {
                    const scopesOverride = connectionConfig['oauth_scopes_override'];
                    connectionConfig['oauth_scopes_override'] = !Array.isArray(scopesOverride) ? scopesOverride.split(',') : scopesOverride;
                }

                const connCreatedHook = (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            connection: res.connection,
                            environment,
                            account,
                            auth_mode: 'OAUTH2_CC',
                            operation: res.operation,
                            endUser: undefined
                        },
                        providerName,
                        logContextGetter
                    );
                };

                const [imported] = await connectionService.importOAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    metadata,
                    environment,
                    account,
                    connectionConfig,
                    parsedRawCredentials: oAuthCredentials,
                    connectionCreatedHook: connCreatedHook
                });

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (provider.auth_mode === 'OAUTH1') {
                const { oauth_token, oauth_token_secret } = req.body;

                if (!oauth_token) {
                    errorManager.errRes(res, 'missing_oauth_token');
                    return;
                }

                if (!oauth_token_secret) {
                    errorManager.errRes(res, 'missing_oauth_token_secret');
                    return;
                }

                const oAuthCredentials: OAuth1Credentials = {
                    type: provider.auth_mode,
                    oauth_token,
                    oauth_token_secret,
                    raw: req.body.raw || req.body
                };

                const connCreatedHook = (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            connection: res.connection,
                            environment,
                            account,
                            auth_mode: 'OAUTH2',
                            operation: res.operation,
                            endUser: undefined
                        },
                        providerName,
                        logContextGetter
                    );
                };

                const [imported] = await connectionService.importOAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    metadata,
                    environment,
                    account,
                    connectionConfig: { ...connection_config },
                    parsedRawCredentials: oAuthCredentials,
                    connectionCreatedHook: connCreatedHook
                });

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (provider.auth_mode === 'BASIC') {
                const { username, password } = req.body;

                if (!username) {
                    errorManager.errRes(res, 'missing_basic_username');
                    return;
                }

                const credentials: BasicApiCredentials = {
                    type: provider.auth_mode,
                    username,
                    password
                };

                const connCreatedHook = (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            connection: res.connection,
                            environment,
                            account,
                            auth_mode: 'API_KEY',
                            operation: res.operation,
                            endUser: undefined
                        },
                        providerName,
                        logContextGetter
                    );
                };
                const [imported] = await connectionService.importApiAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    metadata,
                    environment,
                    account,
                    credentials,
                    connectionConfig: { ...connection_config },
                    connectionCreatedHook: connCreatedHook
                });

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (provider.auth_mode === 'API_KEY') {
                const { api_key: apiKey } = req.body;

                if (!apiKey) {
                    errorManager.errRes(res, 'missing_api_key');
                    return;
                }

                const credentials: ApiKeyCredentials = {
                    type: provider.auth_mode,
                    apiKey
                };

                const connCreatedHook = (res: ConnectionUpsertResponse) => {
                    void connectionCreatedHook(
                        {
                            connection: res.connection,
                            environment,
                            account,
                            auth_mode: 'API_KEY',
                            operation: res.operation,
                            endUser: undefined
                        },
                        providerName,
                        logContextGetter
                    );
                };

                const [imported] = await connectionService.importApiAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    metadata,
                    environment,
                    account,
                    connectionConfig: { ...connection_config },
                    credentials,
                    connectionCreatedHook: connCreatedHook
                });

                if (imported) {
                    updatedConnection = imported;
                }
            } else if (provider.auth_mode === 'APP') {
                const { app_id, installation_id } = req.body;

                if (!app_id) {
                    errorManager.errRes(res, 'missing_app_id');
                    return;
                }

                if (!installation_id) {
                    errorManager.errRes(res, 'missing_installation_id');
                    return;
                }

                const connectionConfig: ConnectionConfig = {
                    installation_id,
                    app_id
                };

                const config = await configService.getProviderConfig(provider_config_key as string, environment.id);

                if (!config) {
                    errorManager.errRes(res, 'unknown_provider_config');
                    return;
                }

                const { success, error, response: credentials } = await connectionService.getAppCredentials(provider, config, connectionConfig);

                if (!success || !credentials) {
                    errorManager.errResFromNangoErr(res, error);
                    return;
                }

                const [imported] = await connectionService.upsertConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    parsedRawCredentials: credentials as unknown as AuthCredentials,
                    connectionConfig,
                    environmentId: environment.id,
                    accountId: account.id,
                    metadata
                });

                if (imported) {
                    updatedConnection = imported;
                    runHook = true;
                }
            } else if (provider.auth_mode === 'TBA') {
                const { token_id, token_secret } = req.body;

                const tbaCredentials: TbaCredentials = {
                    type: provider.auth_mode,
                    token_id,
                    token_secret,
                    config_override: {}
                };

                if ('oauth_client_id_override' in req.body) {
                    tbaCredentials.config_override['client_id'] = req.body['oauth_client_id_override'];
                }

                if ('oauth_client_secret_override' in req.body) {
                    tbaCredentials.config_override['client_secret'] = req.body['oauth_client_secret_override'];
                }

                const config = await configService.getProviderConfig(provider_config_key, environment.id);

                if (!config) {
                    errorManager.errRes(res, 'unknown_provider_config');
                    return;
                }

                if (!connection_config['accountId']) {
                    res.status(400).send({
                        error: { code: 'missing_account_id', message: 'Missing accountId in connection_config. This is required to create a TBA connection.' }
                    });

                    return;
                }

                const [imported] = await connectionService.upsertAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    credentials: tbaCredentials,
                    connectionConfig: {
                        ...connection_config,
                        oauth_client_id: config.oauth_client_id,
                        oauth_client_secret: config.oauth_client_secret
                    },
                    metadata,
                    config,
                    environment,
                    account
                });

                if (imported) {
                    runHook = true;
                    updatedConnection = imported;
                }
            } else if (provider.auth_mode === 'NONE') {
                const [imported] = await connectionService.upsertUnauthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    environment,
                    account,
                    metadata,
                    connectionConfig: { ...connection_config }
                });

                if (imported) {
                    updatedConnection = imported;
                    runHook = true;
                }
            } else {
                errorManager.errRes(res, 'unknown_oauth_type');
                return;
            }

            if (updatedConnection && updatedConnection.connection.id && runHook) {
                void connectionCreatedHook(
                    {
                        connection: updatedConnection.connection,
                        environment,
                        account,
                        auth_mode: provider.auth_mode,
                        operation: updatedConnection.operation || 'unknown',
                        endUser: undefined
                    },
                    providerName,
                    logContextGetter
                );
            }

            res.status(201).send({
                ...req.body,
                connection_id: connectionId
            });
        } catch (err) {
            next(err);
        }
    }
}

export default new ConnectionController();
