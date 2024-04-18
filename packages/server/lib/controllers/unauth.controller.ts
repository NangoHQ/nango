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
    connectionCreationFailed as connectionCreationFailedHook,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    AuthOperation,
    updateProvider as updateProviderActivityLog,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    AuthModes,
    hmacService,
    ErrorSourceEnum,
    LogActionEnum
} from '@nangohq/shared';
import { getOperationContext } from '@nangohq/logs';

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
        const logCtx = await getOperationContext(
            { id: String(activityLogId), operation: { type: 'auth' }, message: 'Authorization Unauthenticated' },
            { account: { id: accountId }, environment: { id: environmentId } }
        );

        try {
            void analytics.track(AnalyticsTypes.PRE_UNAUTH, accountId);

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
                    await logCtx.error('Missing HMAC in query params');
                    await logCtx.failed();

                    errorManager.errRes(res, 'missing_hmac');

                    return;
                }
                const verified = await hmacService.verify(hmac, environmentId, providerConfigKey, connectionId);
                if (!verified) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: environmentId,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: 'Invalid HMAC'
                    });
                    await logCtx.error('Invalid HMAC');
                    await logCtx.failed();

                    errorManager.errRes(res, 'invalid_hmac');

                    return;
                }
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
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = await configService.getTemplate(config?.provider);

            if (template.auth_mode !== AuthModes.None) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config?.provider} does not support unauth creation`
                });
                await logCtx.error('Provider does not support Unauthenticated', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            await updateProviderActivityLog(activityLogId as number, String(config.provider));
            await logCtx.enrichOperation({ configId: String(config.id), configName: config.unique_key });

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Unauthenticated connection creation was successful`,
                timestamp: Date.now()
            });
            await logCtx.info('Unauthenticated connection creation was successful');
            await logCtx.success();

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertUnauthConnection(
                connectionId,
                providerConfigKey,
                config?.provider,
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
                        auth_mode: AuthModes.None,
                        operation: updatedConnection.operation
                    },
                    config?.provider,
                    activityLogId,
                    undefined,
                    logCtx
                );
            }

            res.status(200).send({ providerConfigKey: providerConfigKey, connectionId: connectionId });
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Error during Unauth create: ${prettyError}`,
                timestamp: Date.now()
            });
            await logCtx.error('Error during Unauthenticated connection creation', { error: err });
            await logCtx.failed();

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });

            void connectionCreationFailedHook(
                {
                    id: -1,
                    connection_id: connectionId as string,
                    provider_config_key: providerConfigKey as string,
                    environment_id: environmentId,
                    auth_mode: AuthModes.None,
                    error: `Error during Unauth create: ${prettyError}`,
                    operation: AuthOperation.UNKNOWN
                },
                'unknown',
                activityLogId,
                logCtx
            );

            next(err);
        }
    }
}

export default new UnAuthController();
