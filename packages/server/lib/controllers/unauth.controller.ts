import type { Request, Response, NextFunction } from 'express';
import type { LogLevel } from '@nangohq/shared';
import {
    getAccount,
    getEnvironmentId,
    createActivityLog,
    errorManager,
    analytics,
    AnalyticsTypes,
    connectionCreated as connectionCreatedHook,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    updateProvider as updateProviderActivityLog,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    AuthModes,
    hmacService,
    ErrorSourceEnum,
    LogActionEnum
} from '@nangohq/shared';

class UnAuthController {
    async create(req: Request, res: Response, next: NextFunction) {
        const accountId = getAccount(res);
        const environmentId = getEnvironmentId(res);
        const { providerConfigKey } = req.params;
        const connectionId = req.query['connection_id'] as string | undefined;

        const log = {
            level: 'info' as LogLevel,
            success: false,
            action: LogActionEnum.AUTH,
            start: Date.now(),
            end: Date.now(),
            timestamp: Date.now(),
            connection_id: connectionId as string,
            provider_config_key: providerConfigKey as string,
            environment_id: environmentId
        };

        const activityLogId = await createActivityLog(log);

        try {
            analytics.track(AnalyticsTypes.PRE_UNAUTH, accountId);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            const hmacEnabled = await hmacService.isEnabled(environmentId);
            if (hmacEnabled) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: environmentId,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: 'Missing HMAC in query params'
                    });

                    errorManager.errRes(res, 'missing_hmac');

                    return;
                }
                const verified = await hmacService.verify(hmac as string, environmentId, providerConfigKey as string, connectionId as string);
                if (!verified) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: environmentId,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: 'Invalid HMAC'
                    });

                    errorManager.errRes(res, 'invalid_hmac');

                    return;
                }
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

            if (template.auth_mode !== AuthModes.None) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config?.provider} does not support unauth creation`
                });

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            await updateProviderActivityLog(activityLogId as number, String(config?.provider));

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Unauthenticated connection creation was successful`,
                timestamp: Date.now()
            });

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertUnauthConnection(
                connectionId as string,
                providerConfigKey as string,
                config?.provider as string,
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
                    config?.provider as string
                );
            }

            res.status(200).send({ providerConfigKey: providerConfigKey as string, connectionId: connectionId as string });
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Error during Unauth create: ${prettyError}`,
                timestamp: Date.now()
            });

            await errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });
            next(err);
        }
    }
}

export default new UnAuthController();
