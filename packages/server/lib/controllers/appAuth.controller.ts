import type { Request, Response, NextFunction } from 'express';
import {
    environmentService,
    AuthCredentials,
    NangoError,
    SyncClient,
    findActivityLogBySession,
    errorManager,
    analytics,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    AuthModes
} from '@nangohq/shared';
import { missesInterpolationParam } from '../utils/utils.js';
import { WSErrBuilder } from '../utils/web-socket-error.js';
import oAuthSessionService from '../services/oauth-session.service.js';
import wsClient from '../clients/web-socket.client.js';

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

        analytics.track('server:pre_appauth', accountId);

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
                    activity_log_id: activityLogId as number,
                    content: WSErrBuilder.InvalidConnectionConfig(template.token_url, JSON.stringify(connectionConfig)).message,
                    timestamp: Date.now(),
                    auth_mode: template.auth_mode,
                    url: req.originalUrl,
                    params: {
                        ...connectionConfig
                    }
                });

                return wsClient.notifyErr(
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
                    activity_log_id: activityLogId as number,
                    content: `Error during app token retrieval call: ${error?.message}`,
                    timestamp: Date.now()
                });

                return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, error as NangoError);
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
                const syncClient = await SyncClient.getInstance();
                await syncClient?.initiate(updatedConnection.id);
            }

            await createActivityLogMessageAndEnd({
                level: 'info',
                activity_log_id: activityLogId as number,
                content: 'App connection was successful and credentials were saved',
                timestamp: Date.now()
            });

            return wsClient.notifySuccess(res, wsClientId, providerConfigKey, connectionId);
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            const content = WSErrBuilder.UnkownError().message + '\n' + prettyError;

            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId as number,
                content,
                timestamp: Date.now(),
                auth_mode: AuthModes.App,
                url: req.originalUrl
            });

            return wsClient.notifyErr(res, wsClientId, providerConfigKey, connectionId, WSErrBuilder.UnkownError(prettyError));
        }
    }
}

export default new AppAuthController();
