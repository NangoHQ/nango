import type { Request, Response, NextFunction } from 'express';
import type { AuthCredentials, NangoError } from '@nangohq/shared';
import {
    environmentService,
    errorManager,
    analytics,
    AnalyticsTypes,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    configService,
    connectionService,
    LogActionEnum,
    createActivityLogMessageAndEnd,
    telemetry,
    AuthOperation,
    LogTypes,
    AuthModes
} from '@nangohq/shared';
import { missesInterpolationParam } from '../utils/utils.js';
import * as WSErrBuilder from '../utils/web-socket-error.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import publisher from '../clients/publisher.client.js';
import { logContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../hooks/hooks.js';

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

        const { providerConfigKey, connectionId, webSocketClientId: wsClientId } = session;
        const activityLogId = Number(session.activityLogId);
        const logCtx = await logContextGetter.get({ id: session.activityLogId });

        try {
            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId,
                    content: `Error during API Key auth: config not found`,
                    timestamp: Date.now()
                });
                await logCtx.error('Error during API Key auth: config not found');
                await logCtx.failed();

                await updateSuccessActivityLog(activityLogId, false);

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const template = configService.getTemplate(config.provider);
            const tokenUrl = typeof template.token_url === 'string' ? template.token_url : (template.token_url?.[AuthModes.App] as string);

            if (template.auth_mode !== AuthModes.App) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId,
                    timestamp: Date.now(),
                    content: `Provider ${config.provider} does not support app creation`
                });
                await logCtx.error('Provider does not support app creation', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                await updateSuccessActivityLog(activityLogId, false);

                return;
            }

            if (action === 'request') {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId,
                    content: 'App types do not support the request flow. Please use the github-app-oauth provider for the request flow.',
                    timestamp: Date.now(),
                    auth_mode: AuthModes.App,
                    url: req.originalUrl
                });
                await logCtx.error('App types do not support the request flow. Please use the github-app-oauth provider for the request flow.', {
                    provider: config.provider,
                    url: req.originalUrl
                });
                await logCtx.failed();

                await updateSuccessActivityLog(activityLogId, false);

                errorManager.errRes(res, 'wrong_auth_mode');

                return;
            }

            const connectionConfig = {
                installation_id,
                app_id: config.oauth_client_id
            };

            if (missesInterpolationParam(tokenUrl, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId,
                    content: error.message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: req.originalUrl,
                    params: {
                        ...connectionConfig
                    }
                });
                await logCtx.error(error.message, { connectionConfig, url: req.originalUrl });
                await logCtx.failed();

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error);
            }

            if (!installation_id) {
                await logCtx.failed();
                res.sendStatus(400);
                return;
            }

            const { success, error, response: credentials } = await connectionService.getAppCredentials(template, config, connectionConfig);

            if (!success || !credentials) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId,
                    content: `Error during app token retrieval call: ${error?.message}`,
                    timestamp: Date.now()
                });
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
                        authMode: String(template.auth_mode),
                        level: 'error'
                    }
                );

                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                        environment,
                        account,
                        auth_mode: AuthModes.App,
                        error: `Error during app token retrieval call: ${error?.message}`,
                        operation: AuthOperation.UNKNOWN
                    },
                    session.provider,
                    activityLogId,
                    logCtx
                );

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error as NangoError);
            }

            await updateSuccessActivityLog(activityLogId, true);

            const [updatedConnection] = await connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                session.provider,
                credentials as unknown as AuthCredentials,
                connectionConfig as Record<string, string | boolean>,
                environment.id,
                account.id
            );

            if (updatedConnection) {
                await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
                void connectionCreatedHook(
                    {
                        connection: updatedConnection.connection,
                        environment,
                        account,
                        auth_mode: AuthModes.App,
                        operation: updatedConnection.operation
                    },
                    session.provider,
                    logContextGetter,
                    activityLogId,
                    undefined,
                    logCtx
                );
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: environment.id,
                activity_log_id: activityLogId,
                content: 'App connection was successful and credentials were saved',
                timestamp: Date.now()
            });
            await logCtx.error('App connection was successful and credentials were saved');
            await logCtx.success();

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'App auth token request succeeded', LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(template.auth_mode)
            });

            return publisher.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            const error = WSErrBuilder.UnknownError();
            const content = error.message + '\n' + prettyError;

            await createActivityLogMessage({
                level: 'error',
                environment_id: environment.id,
                activity_log_id: activityLogId,
                content,
                timestamp: Date.now(),
                auth_mode: AuthModes.App,
                url: req.originalUrl
            });
            await logCtx.error(error.message, { error: err, url: req.originalUrl });
            await logCtx.failed();

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, `App auth request process failed ${content}`, LogActionEnum.AUTH, {
                environmentId: String(environment.id),
                providerConfigKey: String(providerConfigKey),
                connectionId: String(connectionId)
            });

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                    environment,
                    account,
                    auth_mode: AuthModes.App,
                    error: content,
                    operation: AuthOperation.UNKNOWN
                },
                'unknown',
                activityLogId,
                logCtx
            );

            return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnknownError(prettyError));
        }
    }
}

export default new AppAuthController();
