import type { Request, Response, NextFunction } from 'express';
import type { LogLevel, AuthCredentials } from '@nangohq/shared';
import {
    createActivityLog,
    errorManager,
    analytics,
    AnalyticsTypes,
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
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import type { RequestLocals } from '../utils/express.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../hooks/hooks.js';

class AppStoreAuthController {
    async auth(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { environment, account } = res.locals;
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
            environment_id: environment.id
        };

        const activityLogId = await createActivityLog(log);
        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                {
                    id: String(activityLogId),
                    operation: { type: 'auth', action: 'create_connection' },
                    message: 'Create connection via App Store',
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_APP_STORE_AUTH, account.id);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            const hmacEnabled = await hmacService.isEnabled(environment.id);
            if (hmacEnabled) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: environment.id,
                        activity_log_id: activityLogId as number,
                        timestamp: Date.now(),
                        content: 'Missing HMAC in query params'
                    });
                    await logCtx.error('Missing HMAC in query params');
                    await logCtx.failed();

                    errorManager.errRes(res, 'missing_hmac');

                    return;
                }
                const verified = await hmacService.verify(hmac, environment.id, providerConfigKey, connectionId);
                if (!verified) {
                    await createActivityLogMessageAndEnd({
                        level: 'error',
                        environment_id: environment.id,
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

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId as number,
                    content: `Error during App store auth: config not found`,
                    timestamp: Date.now()
                });
                await logCtx.error('Invalid HMAC');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = configService.getTemplate(config.provider);

            if (template.auth_mode !== AuthModes.AppStore) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config.provider} does not support App store auth`
                });
                await logCtx.error('Provider does not support API key auth', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            await updateProviderActivityLog(activityLogId as number, String(config.provider));
            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

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
                        connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                        environment,
                        account,
                        auth_mode: AuthModes.AppStore,
                        error: `Error during App store credentials auth: ${error?.message}`,
                        operation: AuthOperation.UNKNOWN
                    },
                    config.provider,
                    activityLogId,
                    logCtx
                );

                errorManager.errResFromNangoErr(res, error);
                return;
            }

            await createActivityLogMessage({
                level: 'info',
                environment_id: environment.id,
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
                config.provider,
                credentials as unknown as AuthCredentials,
                connectionConfig,
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
                        auth_mode: AuthModes.AppStore,
                        operation: updatedConnection.operation
                    },
                    config.provider,
                    logContextGetter,
                    activityLogId,
                    undefined,
                    logCtx
                );
            }

            res.status(200).send({ providerConfigKey: providerConfigKey, connectionId: connectionId });
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            await createActivityLogMessage({
                level: 'error',
                environment_id: environment.id,
                activity_log_id: activityLogId as number,
                content: `Error during App store auth: ${prettyError}`,
                timestamp: Date.now()
            });
            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId!, provider_config_key: providerConfigKey! },
                        environment,
                        account,
                        auth_mode: AuthModes.AppStore,
                        error: `Error during App store auth: ${prettyError}`,
                        operation: AuthOperation.UNKNOWN
                    },
                    'unknown',
                    activityLogId,
                    logCtx
                );
                await logCtx.error('Error during API key auth', { error: err });
                await logCtx.failed();
            }

            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.AUTH,
                environmentId: environment.id,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });

            next(err);
        }
    }
}

export default new AppStoreAuthController();
