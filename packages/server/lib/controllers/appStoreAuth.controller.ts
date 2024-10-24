import type { Request, Response, NextFunction } from 'express';
import type { AuthCredentials } from '@nangohq/shared';
import {
    errorManager,
    analytics,
    AnalyticsTypes,
    configService,
    connectionService,
    hmacService,
    ErrorSourceEnum,
    LogActionEnum,
    getProvider
} from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import type { RequestLocals } from '../utils/express.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../hooks/hooks.js';
import { linkConnection } from '../services/endUser.service.js';
import db from '@nangohq/database';

class AppStoreAuthController {
    async auth(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { environment, account, authType } = res.locals;
        const { providerConfigKey } = req.params;
        const receivedConnectionId = req.query['connection_id'] as string | undefined;

        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                {
                    operation: { type: 'auth', action: 'create_connection' },
                    meta: { authType: 'appstore' },
                    expiresAt: defaultOperationExpiration.auth()
                },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_APP_STORE_AUTH, account.id);

            if (!providerConfigKey) {
                errorManager.errRes(res, 'missing_connection');

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
                const verified = await hmacService.verify(hmac, environment.id, providerConfigKey, receivedConnectionId);
                if (!verified) {
                    await logCtx.error('Invalid HMAC');
                    await logCtx.failed();

                    errorManager.errRes(res, 'invalid_hmac');

                    return;
                }
            }

            const connectionId = receivedConnectionId || connectionService.generateConnectionId();

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (config == null) {
                await logCtx.error('Invalid HMAC');
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

            if (provider.auth_mode !== 'APP_STORE') {
                await logCtx.error('Provider does not support API key auth', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

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

            const { success, error, response: credentials } = await connectionService.getAppStoreCredentials(provider, connectionConfig, privateKey);

            if (!success || !credentials) {
                void connectionCreationFailedHook(
                    {
                        connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                        environment,
                        account,
                        auth_mode: 'APP_STORE',
                        error: {
                            type: 'credential_fetch_failure',
                            description: `Error during App store credentials auth: ${error?.message}`
                        },
                        operation: 'unknown'
                    },
                    config.provider,
                    logCtx
                );

                errorManager.errResFromNangoErr(res, error);
                return;
            }

            const [updatedConnection] = await connectionService.upsertConnection({
                connectionId,
                providerConfigKey,
                provider: config.provider,
                parsedRawCredentials: credentials as unknown as AuthCredentials,
                connectionConfig,
                environmentId: environment.id,
                accountId: account.id
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
            await logCtx.info('App Store auth creation was successful');
            await logCtx.success();

            void connectionCreatedHook(
                {
                    connection: updatedConnection.connection,
                    environment,
                    account,
                    auth_mode: 'APP_STORE',
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

            void connectionCreationFailedHook(
                {
                    connection: { connection_id: receivedConnectionId!, provider_config_key: providerConfigKey! },
                    environment,
                    account,
                    auth_mode: 'APP_STORE',
                    error: {
                        type: 'unknown',
                        description: `Error during App store auth: ${prettyError}`
                    },
                    operation: 'unknown'
                },
                'unknown',
                logCtx
            );
            if (logCtx) {
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

export default new AppStoreAuthController();
