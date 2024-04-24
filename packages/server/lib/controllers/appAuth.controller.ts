import type { Request, Response, NextFunction } from 'express';
import type { AuthCredentials, NangoError } from '@nangohq/shared';
import {
    environmentService,
    connectionCreated as connectionCreatedHook,
    connectionCreationFailed as connectionCreationFailedHook,
    findActivityLogBySession,
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

class AppAuthController {
    async connect(req: Request, res: Response, _next: NextFunction) {
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
        const accountId = (await environmentService.getAccountIdFromEnvironment(session.environmentId)) as number;

        void analytics.track(AnalyticsTypes.PRE_APP_AUTH, accountId);

        const { providerConfigKey, connectionId, webSocketClientId: wsClientId, environmentId } = session;
        const activityLogId = await findActivityLogBySession(session.id);
        // TODO: fix this
        const logCtx = logContextGetter.get({ id: String(activityLogId) });

        try {
            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: `Error during API Key auth: config not found`,
                    timestamp: Date.now()
                });
                await logCtx.error('Error during API Key auth: config not found');
                await logCtx.failed();

                await updateSuccessActivityLog(activityLogId as number, false);

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = await configService.getTemplate(config?.provider);
            const tokenUrl = typeof template.token_url === 'string' ? template.token_url : (template.token_url[AuthModes.App] as string);

            if (template.auth_mode !== AuthModes.App) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config?.provider} does not support app creation`
                });
                await logCtx.error('Provider does not support app creation', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                await updateSuccessActivityLog(activityLogId as number, false);

                return;
            }

            if (action === 'request') {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
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

                await updateSuccessActivityLog(activityLogId as number, false);

                errorManager.errRes(res, 'wrong_auth_mode');

                return;
            }

            const connectionConfig = {
                installation_id,
                app_id: config?.oauth_client_id
            };

            if (missesInterpolationParam(tokenUrl, connectionConfig)) {
                const error = WSErrBuilder.InvalidConnectionConfig(tokenUrl, JSON.stringify(connectionConfig));
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
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
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
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
                        environmentId: String(environmentId),
                        providerConfigKey: String(providerConfigKey),
                        connectionId: String(connectionId),
                        authMode: String(template.auth_mode)
                    }
                );

                void connectionCreationFailedHook(
                    {
                        id: -1,
                        connection_id: connectionId,
                        provider_config_key: providerConfigKey,
                        environment_id: environmentId,
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

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                session.provider,
                credentials as unknown as AuthCredentials,
                connectionConfig as Record<string, string | boolean>,
                environmentId,
                accountId
            );

            if (updatedConnection) {
                void connectionCreatedHook(
                    {
                        id: updatedConnection.id,
                        connection_id: connectionId,
                        provider_config_key: providerConfigKey,
                        environment_id: environmentId,
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
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: 'App connection was successful and credentials were saved',
                timestamp: Date.now()
            });
            await logCtx.error('App connection was successful and credentials were saved');
            await logCtx.success();

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'App auth token request succeeded', LogActionEnum.AUTH, {
                environmentId: String(environmentId),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(template.auth_mode)
            });

            return publisher.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            const error = WSErrBuilder.UnknownError();
            const content = error.message + '\n' + prettyError;

            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content,
                timestamp: Date.now(),
                auth_mode: AuthModes.App,
                url: req.originalUrl
            });
            await logCtx.error(error.message, { error: err, url: req.originalUrl });
            await logCtx.failed();

            await telemetry.log(LogTypes.AUTH_TOKEN_REQUEST_FAILURE, `App auth request process failed ${content}`, LogActionEnum.AUTH, {
                environmentId: String(environmentId),
                providerConfigKey: String(providerConfigKey),
                connectionId: String(connectionId)
            });

            void connectionCreationFailedHook(
                {
                    id: -1,
                    connection_id: connectionId,
                    provider_config_key: providerConfigKey,
                    environment_id: environmentId,
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
