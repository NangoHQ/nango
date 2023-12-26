import type { Request, Response, NextFunction } from 'express';
import {
    environmentService,
    AuthCredentials,
    NangoError,
    connectionCreated as connectionCreatedHook,
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
    metricsManager,
    MetricTypes,
    AuthModes
} from '@nangohq/shared';
import { missesInterpolationParam } from '../utils/utils.js';
import { WSErrBuilder } from '../utils/web-socket-error.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import publisher from '../clients/publisher.client.js';

class AppAuthController {
    async connect(req: Request, res: Response, _next: NextFunction) {
        const installation_id = req.query['installation_id'] as string | undefined;
        const state = req.query['state'] as string;

        if (!state || !installation_id) {
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

        analytics.track(AnalyticsTypes.PRE_APP_AUTH, accountId);

        const { providerConfigKey, connectionId, webSocketClientId: wsClientId, environmentId } = session;
        const activityLogId = await findActivityLogBySession(session.id);

        try {
            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            const config = await configService.getProviderConfig(providerConfigKey as string, environmentId);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: `Error during API Key auth: config not found`,
                    timestamp: Date.now()
                });

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = await configService.getTemplate(config?.provider as string);

            if (template.auth_mode !== AuthModes.App) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config?.provider} does not support app creation`
                });

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            const connectionConfig = {
                installation_id: installation_id,
                app_id: config?.oauth_client_id
            };

            if (missesInterpolationParam(template.token_url, connectionConfig)) {
                await createActivityLogMessage({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.InvalidConnectionConfig(template.token_url, JSON.stringify(connectionConfig)).message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: req.originalUrl,
                    params: {
                        ...connectionConfig
                    }
                });

                return publisher.notifyErr(
                    res,
                    wsClientId,
                    providerConfigKey,
                    connectionId,
                    WSErrBuilder.InvalidConnectionConfig(template.token_url, JSON.stringify(connectionConfig))
                );
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

                await metricsManager.capture(
                    MetricTypes.AUTH_TOKEN_REQUEST_FAILURE,
                    `App auth token retrieval request process failed ${error?.message}`,
                    LogActionEnum.AUTH,
                    {
                        environmentId: String(environmentId),
                        providerConfigKey: String(providerConfigKey),
                        connectionId: String(connectionId),
                        authMode: String(template.auth_mode)
                    }
                );

                return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, error as NangoError);
            }

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                session.provider,
                credentials as unknown as AuthCredentials,
                connectionConfig,
                environmentId,
                accountId
            );

            if (updatedConnection) {
                await connectionCreatedHook(
                    {
                        id: updatedConnection.id,
                        connection_id: connectionId,
                        provider_config_key: providerConfigKey,
                        environment_id: environmentId
                    },
                    session.provider
                );
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: 'App connection was successful and credentials were saved',
                timestamp: Date.now()
            });

            await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_SUCCESS, 'App auth token request succeeded', LogActionEnum.AUTH, {
                environmentId: String(environmentId),
                providerConfigKey: String(providerConfigKey),
                provider: String(config.provider),
                connectionId: String(connectionId),
                authMode: String(template.auth_mode)
            });

            return publisher.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            const content = WSErrBuilder.UnkownError().message + '\n' + prettyError;

            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content,
                timestamp: Date.now(),
                auth_mode: AuthModes.App,
                url: req.originalUrl
            });

            await metricsManager.capture(MetricTypes.AUTH_TOKEN_REQUEST_FAILURE, `App auth request process failed ${content}`, LogActionEnum.AUTH, {
                environmentId: String(environmentId),
                providerConfigKey: String(providerConfigKey),
                connectionId: String(connectionId)
            });

            return publisher.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
        }
    }
}

export default new AppAuthController();
