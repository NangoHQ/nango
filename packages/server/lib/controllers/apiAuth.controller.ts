import type { Request, Response, NextFunction } from 'express';
import type { ApiKeyCredentials, BasicApiCredentials } from '@nangohq/shared';
import {
    errorManager,
    analytics,
    AnalyticsTypes,
    configService,
    connectionService,
    getConnectionConfig,
    ErrorSourceEnum,
    LogActionEnum,
    getProvider
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
import { linkConnection } from '../services/endUser.service.js';
import db from '@nangohq/database';
import { hmacCheck } from '../utils/hmac.js';
import { isIntegrationAllowed } from '../utils/auth.js';

class ApiAuthController {
    async apiKey(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { account, environment, authType } = res.locals;
        const { providerConfigKey } = req.params;
        const receivedConnectionId = req.query['connection_id'] as string | undefined;
        const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};

        let logCtx: LogContext | undefined;
        try {
            logCtx = await logContextGetter.create(
                {
                    operation: { type: 'auth', action: 'create_connection' },
                    meta: { authType: 'apikey' },
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_API_KEY_AUTH, account.id);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            const connectionId = receivedConnectionId || connectionService.generateConnectionId();

            if (authType !== 'connectSession') {
                const hmac = req.query['hmac'] as string | undefined;

                const checked = await hmacCheck({ environment, logCtx, providerConfigKey, connectionId, hmac, res });
                if (!checked) {
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

            const provider = getProvider(config.provider);
            if (!provider) {
                await logCtx.error('Unknown provider');
                await logCtx.failed();
                res.status(404).send({ error: { code: 'unknown_provider_template' } });
                return;
            }

            if (provider.auth_mode !== 'API_KEY') {
                await logCtx.error('Provider does not support API key auth', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
                return;
            }

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
                provider,
                credentials,
                connectionId,
                providerConfigKey,
                environment.id,
                connectionConfig
            );

            if (connectionResponse.isErr()) {
                await logCtx.error('Provided credentials are invalid', { provider: config.provider });
                await logCtx.failed();

                errorManager.errResFromNangoErr(res, connectionResponse.error);

                return;
            }

            const [updatedConnection] = await connectionService.upsertAuthConnection({
                connectionId,
                providerConfigKey,
                credentials,
                connectionConfig,
                metadata: {},
                config,
                environment,
                account
            });
            if (!updatedConnection) {
                res.status(500).send({ error: { code: 'server_error', message: 'failed to create connection' } });
                await logCtx.error('Failed to create connection');
                await logCtx.failed();
                return;
            }

            if (authType === 'connectSession') {
                const session = res.locals.connectSession;
                await linkConnection(db.knex, { endUserId: session.endUserId, connection: updatedConnection.connection });
            }

            await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
            await logCtx.info('API key auth creation was successful');
            await logCtx.success();

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
                undefined,
                logCtx
            );

            res.status(200).send({ providerConfigKey: providerConfigKey, connectionId: connectionId });
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: receivedConnectionId!, provider_config_key: providerConfigKey! },
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
                    receivedConnectionId
                }
            });

            next(err);
        }
    }

    async basic(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { account, environment, authType } = res.locals;
        const { providerConfigKey } = req.params;
        const receivedConnectionId = req.query['connection_id'] as string | undefined;
        const connectionConfig = req.query['params'] != null ? getConnectionConfig(req.query['params']) : {};

        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                {
                    operation: { type: 'auth', action: 'create_connection' },
                    meta: { authType: 'basic' },
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_BASIC_API_KEY_AUTH, account.id);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

                return;
            }

            const connectionId = receivedConnectionId || connectionService.generateConnectionId();

            if (authType !== 'connectSession') {
                const hmac = req.query['hmac'] as string | undefined;

                const checked = await hmacCheck({ environment, logCtx, providerConfigKey, connectionId, hmac, res });
                if (!checked) {
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

            const provider = getProvider(config.provider);
            if (!provider) {
                await logCtx.error('Unknown provider');
                await logCtx.failed();
                res.status(404).send({ error: { code: 'unknown_provider_template' } });
                return;
            }

            if (provider.auth_mode !== 'BASIC') {
                await logCtx.error('Provider does not support Basic API auth', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
                return;
            }

            const credentials: BasicApiCredentials = {
                type: 'BASIC',
                username,
                password
            };

            const connectionResponse = await connectionTestHook(
                config.provider,
                provider,
                credentials,
                connectionId,
                providerConfigKey,
                environment.id,
                connectionConfig
            );

            if (connectionResponse.isErr()) {
                await logCtx.error('Provided credentials are invalid', { provider: config.provider });
                await logCtx.failed();

                errorManager.errResFromNangoErr(res, connectionResponse.error);

                return;
            }

            const [updatedConnection] = await connectionService.upsertAuthConnection({
                connectionId,
                providerConfigKey,
                credentials,
                connectionConfig,
                metadata: {},
                config,
                environment,
                account
            });

            if (!updatedConnection) {
                res.status(500).send({ error: { code: 'server_error', message: 'failed to create connection' } });
                await logCtx.error('Failed to create connection');
                await logCtx.failed();
                return;
            }

            if (authType === 'connectSession') {
                const session = res.locals.connectSession;
                await linkConnection(db.knex, { endUserId: session.endUserId, connection: updatedConnection.connection });
            }

            await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
            await logCtx.info('Basic API key auth creation was successful', { username });
            await logCtx.success();

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
                undefined,
                logCtx
            );

            res.status(200).send({ providerConfigKey: providerConfigKey, connectionId: connectionId });
        } catch (err) {
            const prettyError = stringifyError(err, { pretty: true });

            if (logCtx) {
                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: receivedConnectionId!, provider_config_key: providerConfigKey! },
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
                    connectionId: receivedConnectionId
                }
            });

            next(err);
        }
    }
}

export default new ApiAuthController();
