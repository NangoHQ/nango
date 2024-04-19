import type { Request, Response, NextFunction } from 'express';
import type { LogLevel, AuthCredentials } from '@nangohq/shared';
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

class AppStoreAuthController {
    async auth(req: Request, res: Response, next: NextFunction) {
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
            { id: String(activityLogId), operation: { type: 'auth' }, message: 'Authorization App Store' },
            { account: { id: accountId }, environment: { id: environmentId } }
        );

        try {
            void analytics.track(AnalyticsTypes.PRE_APP_STORE_AUTH, accountId);

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
                    content: `Error during App store auth: config not found`,
                    timestamp: Date.now()
                });
                await logCtx.error('Invalid HMAC');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = await configService.getTemplate(config?.provider);

            if (template.auth_mode !== AuthModes.AppStore) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config?.provider} does not support App store auth`
                });
                await logCtx.error('Provider does not support API key auth', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            await updateProviderActivityLog(activityLogId as number, String(config?.provider));
            await logCtx.enrichOperation({ configId: config.id!, configName: config.unique_key });

            if (!req.body.privateKeyId) {
                errorManager.errRes(res, 'missing_private_key_id');

                return;
            }

            if (!req.body.privateKey) {
                errorManager.errRes(res, 'missing_private_key');

                return;
            }

            if (!req.body.issuerId) {
                errorManager.errRes(res, 'missing_issuer_id');

                return;
            }

            const { privateKeyId, privateKey, issuerId, scope } = req.body;

            const connectionConfig = {
                privateKeyId,
                issuerId,
                scope
            };

            const { success, error, response: credentials } = await connectionService.getAppStoreCredentials(template, connectionConfig, privateKey);

            if (!success || !credentials) {
                void connectionCreationFailedHook(
                    {
                        id: -1,
                        connection_id: connectionId,
                        provider_config_key: providerConfigKey,
                        environment_id: environmentId,
                        auth_mode: AuthModes.AppStore,
                        error: `Error during App store credentials auth: ${error?.message}`,
                        operation: AuthOperation.UNKNOWN
                    },
                    config?.provider,
                    activityLogId,
                    logCtx
                );

                errorManager.errResFromNangoErr(res, error);
                return;
            }

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `App store auth creation was successful`,
                timestamp: Date.now()
            });
            await logCtx.info('App Store auth creation was successful');
            await logCtx.success();

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertConnection(
                connectionId,
                providerConfigKey,
                config?.provider,
                credentials as unknown as AuthCredentials,
                connectionConfig,
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
                        auth_mode: AuthModes.AppStore,
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
                content: `Error during App store auth: ${prettyError}`,
                timestamp: Date.now()
            });
            await logCtx.error('Error during API key auth', { error: err });
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
                    auth_mode: AuthModes.AppStore,
                    error: `Error during App store auth: ${prettyError}`,
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

export default new AppStoreAuthController();
