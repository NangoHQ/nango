import type { Request, Response, NextFunction } from 'express';
import type { AuthCredentials, NangoError } from '@nangohq/shared';
import {
    environmentService,
    errorManager,
    analytics,
    AnalyticsTypes,
    configService,
    connectionService,
    LogActionEnum,
    telemetry,
    LogTypes,
    getProvider,
    linkConnection
} from '@nangohq/shared';
import { missesInterpolationParam } from '../utils/utils.js';
import * as WSErrBuilder from '../utils/web-socket-error.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import publisher from '../clients/publisher.client.js';
import { logContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../hooks/hooks.js';
import db from '@nangohq/database';
import type { ConnectSessionAndEndUser } from '../services/connectSession.service.js';
import { getConnectSession } from '../services/connectSession.service.js';

class AppAuthController {
    async connect(req: Request, res: Response<any, never>, _next: NextFunction) {
        const installation_id = req.query['installation_id'] as string | undefined;
        const state = req.query['state'] as string;
        const action = req.query['setup_action'] as string;

        // this is an instance where an organization approved an install
        // reconcile the installation id using the webhook
        if ((action === 'install' && !state) || (action === 'update' && !state)) {
            res.redirect(req.get('referer') || req.get('Referer') || req.headers.referer || 'https://github.com');
            return;
        }

        if (!state) {
            res.sendStatus(400);
            return;
        }

        const session = await oAuthSessionService.findById(state);

        if (!session) {
            res.sendStatus(404);
            return;
        } else {
            await oAuthSessionService.delete(session.id);
        }

        const environmentAndAccountLookup = await environmentService.getAccountAndEnvironment({ environmentId: session.environmentId });

        if (!environmentAndAccountLookup) {
            res.sendStatus(404);
            return;
        }

        const { environment, account } = environmentAndAccountLookup;

        void analytics.track(AnalyticsTypes.PRE_APP_AUTH, account.id);

        const { providerConfigKey, connectionId: receivedConnectionId, webSocketClientId: wsClientId } = session;
        const logCtx = await logContextGetter.get({ id: session.activityLogId });

        try {
            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');
                return;
            }

            const connectionId = receivedConnectionId || connectionService.generateConnectionId();

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (config == null) {
                await logCtx.error('Error during API Key auth: config not found');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const provider = getProvider(config.provider);
            if (!provider) {
                await logCtx.error('Unknown provider');
                await logCtx.failed();
                res.status(404).send({ error: { code: 'unknown_provider_template' } });
                return;
            }

            const tokenUrl = typeof provider.token_url === 'string' ? provider.token_url : (provider.token_url?.['APP'] as string);

            if (provider.auth_mode !== 'APP') {
                await logCtx.error('Provider does not support app creation', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            if (action === 'request') {
                await logCtx.error('App types do not support the request flow. Please use the github-app-oauth provider for the request flow.', {
                    provider: config.provider,
                    url: req.originalUrl
                });
                await logCtx.failed();

                errorManager.errRes(res, 'wrong_auth_mode');

                return;
            }

            const connectionConfig = {
                installation_id,
                app_id: config.oauth_client_id
            };

            if (missesInterpolationParam(tokenUrl, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
                await logCtx.error(error.message, { connectionConfig, url: req.originalUrl });
                await logCtx.failed();

                await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
                return;
            }

            if (!installation_id) {
                await logCtx.failed();
                res.sendStatus(400);
                return;
            }

            const { success, error, response: credentials } = await connectionService.getAppCredentials(provider, config, connectionConfig);

            if (!success || !credentials) {
                await logCtx.error('Error during app token retrieval call', { error });
                await logCtx.failed();

                await telemetry.log(
                    LogTypes.AUTH_TOKEN_REQUEST_FAILURE,
                    `App auth token retrieval request process failed ${error?.message}`,
                    LogActionEnum.AUTH,
                    {
                        environmentId: String(environment.id),
                        providerConfigKey: String(providerConfigKey),
                        connectionId: String(connectionId),
                        authMode: String(provider.auth_mode),
                        level: 'error'
                    }
                );

                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                        environment,
                        account,
                        auth_mode: 'APP',
                        error: {
                            type: 'unknown',
                            description: `Error during app token retrieval call: ${error?.message}`
                        },
                        operation: 'unknown'
                    },
                    session.provider,
                    logCtx
                );

                await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error as NangoError);
                return;
            }

            const [updatedConnection] = await connectionService.upsertConnection({
                connectionId,
                providerConfigKey,
                provider: session.provider,
                parsedRawCredentials: credentials as unknown as AuthCredentials,
                connectionConfig,
                environmentId: environment.id,
                accountId: account.id
            });
            if (!updatedConnection) {
                await logCtx.error('Failed to create connection');
                await logCtx.failed();
                await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to create connection'));
                return;
            }

            let connectSession: ConnectSessionAndEndUser | undefined;
            if (session.connectSessionId) {
                const connectSessionRes = await getConnectSession(db.knex, {
                    id: session.connectSessionId,
                    accountId: account.id,
                    environmentId: environment.id
                });
                if (connectSessionRes.isErr()) {
                    await logCtx.error('Failed to get session');
                    await logCtx.failed();
                    await publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnknownError('failed to get session'));
                    return;
                }

                connectSession = connectSessionRes.value;
                await linkConnection(db.knex, { endUserId: connectSession.connectSession.endUserId, connection: updatedConnection.connection });
            }

            await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
            void connectionCreatedHook(
                {
                    connection: updatedConnection.connection,
                    environment,
                    account,
                    auth_mode: 'APP',
                    operation: updatedConnection.operation,
                    endUser: connectSession?.endUser
                },
                session.provider,
                logContextGetter,
                undefined,
                logCtx
            );

            await logCtx.info('App connection was successful and credentials were saved');
            await logCtx.success();

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'App auth token request succeeded', LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(provider.auth_mode)
            });

            await publisher.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
            return;
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            const error = WSErrBuilder.UnknownError();
            const content = error.message + '\n' + prettyError;

            await logCtx.error(error.message, { error: err, url: req.originalUrl });
            await logCtx.failed();

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, `App auth request process failed ${content}`, LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                connectionId: String(receivedConnectionId)
            });

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: receivedConnectionId, provider_config_key: providerConfigKey },
                    environment,
                    account,
                    auth_mode: 'APP',
                    error: {
                        type: 'unknown',
                        description: content
                    },
                    operation: 'unknown'
                },
                'unknown',
                logCtx
            );

            return publisher.notifyErr(res, wsClientId, providerConfigKey, receivedConnectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }
}

export default new AppAuthController();
