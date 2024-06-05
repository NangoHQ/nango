import type { Request, Response, NextFunction } from 'express';
import tracer from 'dd-trace';
import type { ApiKeyCredentials, BasicApiCredentials } from '@nangohq/shared';
import {
    errorManager,
    analytics,
    AnalyticsTypes,
    AuthOperation,
    configService,
    connectionService,
    AuthModes,
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

        let logCtx: LogContext | undefined;
        try {
            void analytics.track(AnalyticsTypes.PRE_API_KEY_AUTH, account.id);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            if (!connectionId) {
                errorManager.errRes(res, 'missing_connection_id');

                return;
            }

            if (!req.body.apiKey) {
                errorManager.errRes(res, 'missing_api_key');

                return;
            }

            logCtx = await logContextGetter.create(
                { operation: { type: 'auth', action: 'create_connection' }, message: 'Authorization API Key', expiresAt: defaultOperationExpiration.auth() },
                { account, environment }
            );

            const hmacEnabled = await hmacService.isEnabled(environment.id);
            if (hmacEnabled) {
                const hmac = req.query['hmac'] as string | undefined;
                if (!hmac) {
                    await logCtx.error('Missing HMAC in query params');
                    await logCtx.failed();

                    errorManager.errRes(res, 'missing_hmac');

                    return;
                }
                const verified = await hmacService.verify(hmac, environment.id, providerConfigKey, connectionId);
                if (!verified) {
                    await logCtx.error('Invalid HMAC');
                    await logCtx.failed();

                    errorManager.errRes(res, 'invalid_hmac');

                    return;
                }
            }

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (config == null) {
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = configService.getTemplate(config.provider);

            if (template.auth_mode !== AuthModes.ApiKey) {
                await logCtx.error('Provider does not support API key auth', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

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
                environment.id,
                connectionConfig,
                tracer
            );

            if (connectionResponse.isErr()) {
                await logCtx.error('Provided credentials are invalid');
                await logCtx.failed();

                errorManager.errResFromNangoErr(res, connectionResponse.error);
                return;
            }

            await logCtx.info('API key auth creation was successful');
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
                        auth_mode: AuthModes.ApiKey,
                        operation: updatedConnection.operation
                    },
                    config.provider,
                    logContextGetter,
                    undefined,
                    logCtx
                );
            }

            res.status(200).send({ providerConfigKey: providerConfigKey, connectionId: connectionId });
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId!, provider_config_key: providerConfigKey! },
                        environment,
                        account,
                        auth_mode: AuthModes.ApiKey,
                        error: `Error during API key auth: ${prettyError}`,
                        operation: AuthOperation.UNKNOWN
                    },
                    'unknown',
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

        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                { operation: { type: 'auth', action: 'create_connection' }, message: 'Authorization Basic', expiresAt: defaultOperationExpiration.auth() },
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
                    await logCtx.error('Missing HMAC in query params');
                    await logCtx.failed();

                    errorManager.errRes(res, 'missing_hmac');

                    return;
                }
                const verified = await hmacService.verify(hmac, environment.id, providerConfigKey, connectionId);
                if (!verified) {
                    await logCtx.error('Invalid HMAC');
                    await logCtx.failed();

                    errorManager.errRes(res, 'invalid_hmac');
                    return;
                }
            }

            const { username = '', password = '' } = req.body;

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (config == null) {
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            const template = configService.getTemplate(config.provider);

            if (template.auth_mode !== AuthModes.Basic) {
                await logCtx.error('Provider does not support Basic API auth');
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
                environment.id,
                connectionConfig,
                tracer
            );

            if (connectionResponse.isErr()) {
                await logCtx.error('Provided credentials are invalid');
                await logCtx.failed();

                errorManager.errResFromNangoErr(res, connectionResponse.error);

                return;
            }

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
                        auth_mode: AuthModes.Basic,
                        operation: updatedConnection.operation
                    },
                    config.provider,
                    logContextGetter,
                    undefined,
                    logCtx
                );
            }

            res.status(200).send({ providerConfigKey: providerConfigKey, connectionId: connectionId });
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId!, provider_config_key: providerConfigKey! },
                        environment,
                        account,
                        auth_mode: AuthModes.ApiKey,
                        error: `Error during basic API key auth: ${prettyError}`,
                        operation: AuthOperation.UNKNOWN
                    },
                    'unknown',
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
