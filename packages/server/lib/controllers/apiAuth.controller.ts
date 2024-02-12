import type { Request, Response, NextFunction } from 'express';
import tracer from '../tracer.js';
import type { LogLevel } from '@nangohq/shared';
import {
    getAccount,
    getEnvironmentId,
    createActivityLog,
    errorManager,
    analytics,
    AnalyticsTypes,
    AuthOperation,
    connectionCreated as connectionCreatedHook,
    connectionCreationFailed as connectionCreationFailedHook,
    ApiKeyCredentials,
    BasicApiCredentials,
    connectionTest as connectionTestHook,
    isErr,
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

class ApiAuthController {
    async apiKey(req: Request, res: Response, next: NextFunction) {
        const accountId = getAccount(res);
        const environmentId = getEnvironmentId(res);
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

        try {
            analytics.track(AnalyticsTypes.PRE_API_KEY_AUTH, accountId);

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

            if (template.auth_mode !== AuthModes.ApiKey) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config?.provider} does not support API key auth`
                });

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            await updateProviderActivityLog(activityLogId as number, String(config?.provider));

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
                config?.provider,
                template,
                credentials,
                connectionId,
                providerConfigKey,
                environmentId,
                connectionConfig,
                tracer
            );

            if (isErr(connectionResponse)) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: `The credentials provided were not valid for the ${config?.provider} provider`,
                    timestamp: Date.now()
                });

                errorManager.errResFromNangoErr(res, connectionResponse.err);

                return;
            }

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `API key auth creation was successful`,
                timestamp: Date.now()
            });

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertApiConnection(
                connectionId as string,
                providerConfigKey as string,
                config?.provider as string,
                credentials,
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
                        environment_id: environmentId,
                        auth_mode: AuthModes.ApiKey,
                        operation: updatedConnection.operation
                    },
                    config?.provider as string,
                    activityLogId
                );
            }

            res.status(200).send({ providerConfigKey: providerConfigKey as string, connectionId: connectionId as string });
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Error during API key auth: ${prettyError}`,
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

            await connectionCreationFailedHook(
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
                activityLogId
            );

            next(err);
        }
    }

    async basic(req: Request, res: Response, next: NextFunction) {
        const accountId = getAccount(res);
        const environmentId = getEnvironmentId(res);
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

        try {
            analytics.track(AnalyticsTypes.PRE_BASIC_API_KEY_AUTH, accountId);

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

            const { username = '', password = '' } = req.body;

            const config = await configService.getProviderConfig(providerConfigKey as string, environmentId);

            if (config == null) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: `Error during basic API auth: config not found`,
                    timestamp: Date.now()
                });

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = await configService.getTemplate(config?.provider as string);

            if (template.auth_mode !== AuthModes.Basic) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    timestamp: Date.now(),
                    content: `Provider ${config?.provider} does not support Basic API auth`
                });

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            const credentials: BasicApiCredentials = {
                type: AuthModes.Basic,
                username,
                password
            };

            const connectionResponse = await connectionTestHook(
                config?.provider,
                template,
                credentials,
                connectionId,
                providerConfigKey,
                environmentId,
                connectionConfig,
                tracer
            );

            if (isErr(connectionResponse)) {
                await createActivityLogMessageAndEnd({
                    level: 'error',
                    environment_id: environmentId,
                    activity_log_id: activityLogId as number,
                    content: `The credentials provided were not valid for the ${config?.provider} provider`,
                    timestamp: Date.now()
                });

                errorManager.errResFromNangoErr(res, connectionResponse.err);

                return;
            }

            await updateProviderActivityLog(activityLogId as number, String(config?.provider));

            await createActivityLogMessage({
                level: 'info',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Basic API key auth creation was successful with the username ${username}`,
                timestamp: Date.now()
            });

            await updateSuccessActivityLog(activityLogId as number, true);

            const [updatedConnection] = await connectionService.upsertApiConnection(
                connectionId as string,
                providerConfigKey as string,
                config?.provider as string,
                credentials,
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
                        environment_id: environmentId,
                        auth_mode: AuthModes.Basic,
                        operation: updatedConnection.operation
                    },
                    config?.provider as string,
                    activityLogId
                );
            }

            res.status(200).send({ providerConfigKey: providerConfigKey as string, connectionId: connectionId as string });
        } catch (err) {
            const prettyError = JSON.stringify(err, ['message', 'name'], 2);

            await createActivityLogMessage({
                level: 'error',
                environment_id: environmentId,
                activity_log_id: activityLogId as number,
                content: `Error during basic API auth: ${prettyError}`,
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

            await connectionCreationFailedHook(
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
                activityLogId
            );

            next(err);
        }
    }
}

export default new ApiAuthController();
