import type { Request, Response, NextFunction } from 'express';
import tracer from 'dd-trace';
import type { LogLevel, ApiKeyCredentials, BasicApiCredentials } from '@nangohq/shared';
import {
    createActivityLog,
    errorManager,
    analytics,
    AnalyticsTypes,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    updateProvider as updateProviderActivityLog,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    getConnectionConfig,
    hmacService,
    ErrorSourceEnum,
    LogActionEnum
} from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import type { RequestLocals } from '../utils/express.js';
import {
    connectionCreated as connectionCreatedHook,
    connectionCreationFailed as connectionCreationFailedHook,
    connectionTest as connectionTestHook
} from '../hooks/hooks.js';

class ApiAuthController {
    async apiKey(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { account, environment } = res.locals;
        const { providerConfigKey } = req.params;
        const connectionId = req.query['connection_id'] as string | undefined;
        const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};

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
                    message: 'Authorization API Key',
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_API_KEY_AUTH, account.id);

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
                    content: `Error during API Key auth: config not found`,
                    timestamp: Date.now()
                });
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = configService.getTemplate(config.provider);

            if (template.auth_mode !== 'API_KEY') {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config.provider} does not support API key auth`
                });
                await logCtx.error('Provider does not support API key auth', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            await updateProviderActivityLog(activityLogId as number, String(config.provider));
            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            if (!req.body.apiKey) {
                errorManager.errRes(res, 'missing_api_key');

                return;
            }

            const { apiKey } = req.body;

            const credentials: ApiKeyCredentials = {
                type: 'API_KEY',
                apiKey
            };

            const connectionResponse = await connectionTestHook(
                config.provider,
                template,
                credentials,
                connectionId,
                providerConfigKey,
                environment.id,
                connectionConfig,
                tracer
            );

            if (connectionResponse.isErr()) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId as number,
                    content: `The credentials provided were not valid for the ${config.provider} provider`,
                    timestamp: Date.now()
                });
                await logCtx.error('Provided credentials are invalid', { provider: config.provider });
                await logCtx.failed();

                errorManager.errResFromNangoErr(res, connectionResponse.error);

                return;
            }

            await createActivityLogMessage({
                level: 'info',
                environment_id: environment.id,
                activity_log_id: activityLogId as number,
                content: `API key auth creation was successful`,
                timestamp: Date.now()
            });
            await logCtx.info('API key auth creation was successful');
            await logCtx.success();

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertApiConnection(
                connectionId,
                providerConfigKey,
                config.provider,
                credentials,
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
                        auth_mode: 'API_KEY',
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
                content: `Error during API key auth: ${prettyError}`,
                timestamp: Date.now()
            });
            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId!, provider_config_key: providerConfigKey! },
                        environment,
                        account,
                        auth_mode: 'API_KEY',
                        error: {
                            type: 'unknown',
                            description: `Error during API key auth: ${prettyError}`
                        },
                        operation: 'unknown'
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

    async basic(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { account, environment } = res.locals;
        const { providerConfigKey } = req.params;
        const connectionId = req.query['connection_id'] as string | undefined;
        const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};

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
                    message: 'Authorization Basic',
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_BASIC_API_KEY_AUTH, account.id);

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

            const { username = '', password = '' } = req.body;

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId as number,
                    content: `Error during basic API auth: config not found`,
                    timestamp: Date.now()
                });
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const template = configService.getTemplate(config.provider);

            if (template.auth_mode !== 'BASIC') {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config.provider} does not support Basic API auth`
                });
                await logCtx.error('Provider does not support Basic API auth', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            const credentials: BasicApiCredentials = {
                type: 'BASIC',
                username,
                password
            };

            const connectionResponse = await connectionTestHook(
                config.provider,
                template,
                credentials,
                connectionId,
                providerConfigKey,
                environment.id,
                connectionConfig,
                tracer
            );

            if (connectionResponse.isErr()) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environment.id,
                    activity_log_id: activityLogId as number,
                    content: `The credentials provided were not valid for the ${config.provider} provider`,
                    timestamp: Date.now()
                });
                await logCtx.error('Provided credentials are invalid', { provider: config.provider });
                await logCtx.failed();

                errorManager.errResFromNangoErr(res, connectionResponse.error);

                return;
            }

            await updateProviderActivityLog(activityLogId as number, String(config.provider));

            await createActivityLogMessage({
                level: 'info',
                environment_id: environment.id,
                activity_log_id: activityLogId as number,
                content: `Basic API key auth creation was successful with the username ${username}`,
                timestamp: Date.now()
            });

            await updateSuccessActivityLog(activityLogId as number, true);
            await logCtx.info('Basic API key auth creation was successful', { username });
            await logCtx.success();

            const [updatedConnection] = await connectionService.upsertApiConnection(
                connectionId,
                providerConfigKey,
                config.provider,
                credentials,
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
                        auth_mode: 'BASIC',
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
                content: `Error during basic API auth: ${prettyError}`,
                timestamp: Date.now()
            });
            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId!, provider_config_key: providerConfigKey! },
                        environment,
                        account,
                        auth_mode: 'API_KEY',
                        error: {
                            type: 'unknown',
                            description: `Error during basic API key auth: ${prettyError}`
                        },
                        operation: 'unknown'
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

export default new ApiAuthController();
