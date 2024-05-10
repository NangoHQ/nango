import type { Request, Response, NextFunction } from 'express';
import tracer from 'dd-trace';
import type { LogLevel, ApiKeyCredentials, BasicApiCredentials } from '@nangohq/shared';
import {
    createActivityLog,
    errorManager,
    analytics,
    AnalyticsTypes,
    AuthOperation,
    connectionCreated as connectionCreatedHook,
    connectionCreationFailed as connectionCreationFailedHook,
    connectionTest as connectionTestHook,
    createActivityLogMessage,
    updateSuccess as updateSuccessActivityLog,
    updateProvider as updateProviderActivityLog,
    configService,
    connectionService,
    createActivityLogMessageAndEnd,
    AuthModes,
    getConnectionConfig,
    hmacService,
    ErrorSourceEnum,
    LogActionEnum
} from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import type { RequestLocals } from '../utils/express.js';

class ApiAuthController {
    async apiKey(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const accountId = res.locals['account'].id;
        const environmentId = res.locals['environment'].id;
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
            environment_id: environmentId
        };

        const activityLogId = await createActivityLog(log);

        let logCtx: LogContext | undefined;
        try {
            logCtx = await logContextGetter.create(
                { id: String(activityLogId), operation: { type: 'auth' }, message: 'Authorization API Key' },
                { account: { id: accountId }, environment: { id: environmentId } }
            );
            void analytics.track(AnalyticsTypes.PRE_API_KEY_AUTH, accountId);

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

            const template = configService.getTemplate(config.provider);

            if (template.auth_mode !== AuthModes.ApiKey) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
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
            await logCtx.enrichOperation({ configId: config.id!, configName: config.unique_key });

            if (!req.body.apiKey) {
                errorManager.errRes(res, 'missing_api_key');

                return;
            }

            const { apiKey } = req.body;

            const credentials: ApiKeyCredentials = {
                type: AuthModes.ApiKey,
                apiKey
            };

            const connectionResponse = await connectionTestHook(
                config.provider,
                template,
                credentials,
                connectionId,
                providerConfigKey,
                environmentId,
                connectionConfig,
                tracer
            );

            if (connectionResponse.isErr()) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
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
                environment_id: environmentId,
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
                        auth_mode: AuthModes.ApiKey,
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
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Error during API key auth: ${prettyError}`,
                timestamp: Date.now()
            });
            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        id: -1,
                        connection_id: connectionId as string,
                        provider_config_key: providerConfigKey as string,
                        environment_id: environmentId,
                        auth_mode: AuthModes.ApiKey,
                        error: `Error during API key auth: ${prettyError}`,
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
                environmentId,
                metadata: {
                    providerConfigKey,
                    connectionId
                }
            });

            next(err);
        }
    }

    async basic(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const accountId = res.locals['account'].id;
        const environmentId = res.locals['environment'].id;
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
            environment_id: environmentId
        };

        const activityLogId = await createActivityLog(log);
        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                { id: String(activityLogId), operation: { type: 'auth' }, message: 'Authorization Basic' },
                { account: { id: accountId }, environment: { id: environmentId } }
            );
            void analytics.track(AnalyticsTypes.PRE_BASIC_API_KEY_AUTH, accountId);

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

            const { username = '', password = '' } = req.body;

            const config = await configService.getProviderConfig(providerConfigKey, environmentId);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: `Error during basic API auth: config not found`,
                    timestamp: Date.now()
                });
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = configService.getTemplate(config.provider);

            if (template.auth_mode !== AuthModes.Basic) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
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
                type: AuthModes.Basic,
                username,
                password
            };

            const connectionResponse = await connectionTestHook(
                config.provider,
                template,
                credentials,
                connectionId,
                providerConfigKey,
                environmentId,
                connectionConfig,
                tracer
            );

            if (connectionResponse.isErr()) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
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
            await logCtx.enrichOperation({ configId: config.id!, configName: config.unique_key });

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
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
                        auth_mode: AuthModes.Basic,
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
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Error during basic API auth: ${prettyError}`,
                timestamp: Date.now()
            });
            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        id: -1,
                        connection_id: connectionId as string,
                        provider_config_key: providerConfigKey as string,
                        environment_id: environmentId,
                        auth_mode: AuthModes.ApiKey,
                        error: `Error during basic API key auth: ${prettyError}`,
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

export default new ApiAuthController();
