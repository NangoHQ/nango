import type { Request, Response, NextFunction } from 'express';
import type { LogLevel, LogAction } from '@nangohq/shared';
import {
    getAccount,
    getEnvironmentId,
    createActivityLog,
    errorManager,
    analytics,
    SyncClient,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    updateProvider as updateProviderActivityLog,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    AuthModes
} from '@nangohq/shared';

class ApiAuthController {
    async apiKey(req: Request, res: Response, next: NextFunction) {
        const accountId = getAccount(res);
        const environmentId = getEnvironmentId(res);
        const { providerConfigKey } = req.params;
        const connectionId = req.query['connection_id'] as string | undefined;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: 'auth' as LogAction,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connectionId as string,
            provider_config_key: providerConfigKey as string,
            environment_id: environmentId
        };

        const activityLogId = await createActivityLog(log);

        try {
            // TODO create analytics
            analytics.track('server:pre_api_key_auth', accountId);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
            }

            const config = await configService.getProviderConfig(providerConfigKey as string, environmentId);

            await updateProviderActivityLog(activityLogId as number, String(config?.provider));

            if (!req.body.apiKey) {
                errorManager.errRes(res, 'missing_api_key');
            }

            const { apiKey } = req.body;

            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId as number,
                content: `API key auth creation was successful`,
                timestamp: Date.now()
            });

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertApiConnection(
                connectionId as string,
                providerConfigKey as string,
                config?.provider as string,
                {
                    type: AuthModes.ApiKey,
                    apiKey
                },
                {},
                environmentId,
                accountId
            );

            if (updatedConnection) {
                const syncClient = await SyncClient.getInstance();
                await syncClient?.initiate(updatedConnection.id);
            }

            res.status(200).send();
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId as number,
                content: `Error during API key auth: ${prettyError}`,
                timestamp: Date.now()
            });

            errorManager.report(err, {
                accountId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });
            next(err);
        }
    }

    async basic(req: Request, res: Response, next: NextFunction) {
        const accountId = getAccount(res);
        const environmentId = getEnvironmentId(res);
        const { providerConfigKey } = req.params;
        const connectionId = req.query['connection_id'] as string | undefined;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: 'auth' as LogAction,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connectionId as string,
            provider_config_key: providerConfigKey as string,
            environment_id: environmentId
        };

        const activityLogId = await createActivityLog(log);

        try {
            // TODO create analytics
            analytics.track('server:pre_basic_api_key_auth', accountId);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');
            }

            if (!req.body.username) {
                errorManager.errRes(res, 'missing_basic_username');
            }

            if (!req.body.password) {
                errorManager.errRes(res, 'missing_basic_password');
            }

            const { username, password } = req.body;

            const config = await configService.getProviderConfig(providerConfigKey as string, environmentId);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    activity_log_id: activityLogId as number,
                    content: `Error during basic API auth: config not found`,
                    timestamp: Date.now()
                });

                res.status(404).send();
            }

            await updateProviderActivityLog(activityLogId as number, String(config?.provider));

            await createActivityLogMessage({
                level: 'info',
                activity_log_id: activityLogId as number,
                content: `Basic API key auth creation was successful with the username ${username}`,
                timestamp: Date.now()
            });

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertApiConnection(
                connectionId as string,
                providerConfigKey as string,
                config?.provider as string,
                {
                    type: AuthModes.Basic,
                    username,
                    password
                },
                {},
                environmentId,
                accountId
            );

            if (updatedConnection) {
                const syncClient = await SyncClient.getInstance();
                await syncClient?.initiate(updatedConnection.id);
            }

            res.status(200).send();
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            await createActivityLogMessage({
                level: 'error',
                activity_log_id: activityLogId as number,
                content: `Error during basic API auth: ${prettyError}`,
                timestamp: Date.now()
            });

            errorManager.report(err, {
                accountId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });
            next(err);
        }
    }
}

export default new ApiAuthController();
