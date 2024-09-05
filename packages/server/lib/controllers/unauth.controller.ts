import type { Request, Response, NextFunction } from 'express';
import { errorManager, analytics, AnalyticsTypes, configService, connectionService, hmacService, ErrorSourceEnum, LogActionEnum } from '@nangohq/shared';
import type { LogContext } from '@nangohq/logs';
import { logContextGetter } from '@nangohq/logs';
import { stringifyError } from '@nangohq/utils';
import type { RequestLocals } from '../utils/express.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../hooks/hooks.js';

class UnAuthController {
    async create(req: Request, res: Response<any, Required<RequestLocals>>, next: NextFunction) {
        const { environment, account } = res.locals;
        const { providerConfigKey } = req.params;
        const connectionId = req.query['connection_id'] as string | undefined;

        let logCtx: LogContext | undefined;

        try {
            logCtx = await logContextGetter.create(
                { operation: { type: 'auth', action: 'create_connection' }, meta: { authType: 'unauth' } },
                { account, environment }
            );
            void analytics.track(AnalyticsTypes.PRE_UNAUTH, account.id);

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

            const config = await configService.getProviderConfig(providerConfigKey, environment.id);

            if (config == null) {
                await logCtx.error('Unknown provider config');
                await logCtx.failed();

                errorManager.errRes(res, 'unknown_provider_config');

                return;
            }

            const template = configService.getTemplate(config.provider);

            if (template.auth_mode !== 'NONE') {
                await logCtx.error('Provider does not support Unauthenticated', { provider: config.provider });
                await logCtx.failed();

                errorManager.errRes(res, 'invalid_auth_mode');

                return;
            }

            await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

            await logCtx.info('Unauthenticated connection creation was successful');
            await logCtx.success();

            const [updatedConnection] = await connectionService.upsertUnauthConnection({
                connectionId,
                providerConfigKey,
                provider: config.provider,
                environment,
                account
            });

            if (updatedConnection) {
                await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
                void connectionCreatedHook(
                    {
                        connection: updatedConnection.connection,
                        environment,
                        account,
                        auth_mode: 'NONE',
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

            connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId!, provider_config_key: providerConfigKey! },
                    environment,
                    account,
                    auth_mode: 'NONE',
                    error: {
                        type: 'unknown',
                        description: `Error during Unauth create: ${prettyError}`
                    },
                    operation: 'unknown'
                },
                'unknown',
                logCtx
            );
            if (logCtx) {
                await logCtx.error('Error during Unauthenticated connection creation', { error: err });
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

export default new UnAuthController();
