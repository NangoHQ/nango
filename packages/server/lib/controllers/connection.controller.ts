import db from '@nangohq/database';
import { envs, logContextGetter } from '@nangohq/logs';
import { NangoError, accountService, configService, connectionService, errorManager, getProvider, githubAppClient } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { preConnectionDeletion } from '../hooks/connection/on/connection-deleted.js';
import {
    connectionCreated as connectionCreatedHook,
    connectionCreationStartCapCheck as connectionCreationStartCapCheckHook,
    connectionRefreshSuccess
} from '../hooks/hooks.js';
import { slackService } from '../services/slack.js';
import { getOrchestrator } from '../utils/utils.js';

import type { RequestLocals } from '../utils/express.js';
import type { ConnectionUpsertResponse, OAuth2Credentials } from '@nangohq/shared';
import type {
    ApiKeyCredentials,
    BasicApiCredentials,
    ConnectionConfig,
    OAuth1Credentials,
    OAuth2ClientCredentials,
    ProviderGithubApp,
    ProviderOAuth2,
    TbaCredentials
} from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const orchestrator = getOrchestrator();

class ConnectionController {
    async deleteAdminConnection(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        try {
            if (!flags.hasAdminCapabilities || !envs.NANGO_ADMIN_UUID) {
                res.status(400).send({ error: { code: 'feature_disabled', message: 'Admin capabilities are not enabled' } });
                return;
            }

            const { environment, account: team } = res.locals;
            const connectionId = req.params['connectionId'] as string;

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
                return;
            }

            const integration_key = envs.NANGO_SLACK_INTEGRATION_KEY;
            const env = 'prod';

            const info = await accountService.getAccountAndEnvironmentIdByUUID(envs.NANGO_ADMIN_UUID, env);
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
                slackService,
                preDeletionHook
            });

            // Kill all notifications associated with this env
            await slackService.closeAllOpenNotificationsForEnv(environment.id);

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
                await connectionService.replaceMetadata([connection.id], req.body, trx);
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
            const { environment, account, plan } = res.locals;
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

            if (plan) {
                const isCapped = await connectionCreationStartCapCheckHook({
                    providerConfigKey: provider_config_key,
                    environmentId: environment.id,
                    creationType: 'import',
                    team: account,
                    plan
                });
                if (isCapped.capped) {
                    res.status(400).send({
                        error: {
                            code: 'resource_capped',
                            message:
                                isCapped.code === 'max'
                                    ? 'Reached maximum number of allowed connections for your plan'
                                    : 'Reached maximum number of connections with scripts enabled'
                        }
                    });
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
                    provider.auth_mode,
                    provider as ProviderOAuth2
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
                        account,
                        integration,
                        logContextGetter
                    );
                };

                const [imported] = await connectionService.importOAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    metadata,
                    environment,
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
                        account,
                        integration,
                        logContextGetter
                    );
                };

                const [imported] = await connectionService.importOAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    metadata,
                    environment,
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
                        account,
                        integration,
                        logContextGetter
                    );
                };

                const [imported] = await connectionService.importOAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    metadata,
                    environment,
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
                            auth_mode: 'BASIC',
                            operation: res.operation,
                            endUser: undefined
                        },
                        account,
                        integration,
                        logContextGetter
                    );
                };
                const [imported] = await connectionService.importApiAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    metadata,
                    environment,
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
                        account,
                        integration,
                        logContextGetter
                    );
                };

                const [imported] = await connectionService.importApiAuthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    provider: providerName,
                    metadata,
                    environment,
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

                const credentialsRes = await githubAppClient.createCredentials({
                    provider: provider as ProviderGithubApp,
                    integration: config,
                    connectionConfig
                });
                if (credentialsRes.isErr()) {
                    errorManager.errResFromNangoErr(res, credentialsRes.error);
                    return;
                }

                const [imported] = await connectionService.upsertConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    parsedRawCredentials: credentialsRes.value,
                    connectionConfig,
                    environmentId: environment.id,
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
                    environment
                });

                if (imported) {
                    runHook = true;
                    updatedConnection = imported;
                }
            } else if (provider.auth_mode === 'NONE') {
                const [imported] = await connectionService.upsertUnauthConnection({
                    connectionId,
                    providerConfigKey: provider_config_key,
                    environment,
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

            if (updatedConnection && runHook) {
                void connectionCreatedHook(
                    {
                        connection: updatedConnection.connection,
                        environment,
                        account,
                        auth_mode: provider.auth_mode,
                        operation: updatedConnection.operation || 'unknown',
                        endUser: undefined
                    },
                    account,
                    integration,
                    logContextGetter
                );
            }

            if (updatedConnection && updatedConnection.operation === 'override') {
                // If we updated the connection we assume the connection is now correct
                await connectionRefreshSuccess({ connection: updatedConnection.connection, config: integration });
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
