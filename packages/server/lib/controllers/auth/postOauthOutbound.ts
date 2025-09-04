import * as z from 'zod';

import db from '@nangohq/database';
import { defaultOperationExpiration, endUserToMeta, logContextGetter } from '@nangohq/logs';
import {
    ErrorSourceEnum,
    LogActionEnum,
    configService,
    connectionService,
    errorManager,
    getConnectionConfig,
    getProvider,
    linkConnection
} from '@nangohq/shared';
import { metrics, stringifyError, zodErrorToHTTP } from '@nangohq/utils';

import { connectionCredential, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { validateConnection } from '../../hooks/connection/on/validate-connection.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../../hooks/hooks.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { errorRestrictConnectionId, isIntegrationAllowed } from '../../utils/auth.js';
import { hmacCheck } from '../../utils/hmac.js';

import type { LogContext } from '@nangohq/logs';
import type { ConnectionConfig, PostPublicOauthOutboundAuthorization } from '@nangohq/types';
import type { NextFunction } from 'express';

const queryStringValidation = z
    .object({
        connection_id: connectionIdSchema.optional(),
        hmac: z.string().optional(),
        params: z.record(z.string(), z.any()).optional()
    })
    .and(connectionCredential);

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicOauthOutboundAuthorization = asyncWrapper<PostPublicOauthOutboundAuthorization>(async (req, res, next: NextFunction) => {
    const queryStringVal = queryStringValidation.safeParse(req.query);
    if (!queryStringVal.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringVal.error) }
        });
        return;
    }

    const paramsVal = paramsValidation.safeParse(req.params);
    if (!paramsVal.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramsVal.error) } });
        return;
    }

    const { account, environment, connectSession } = res.locals;
    const { providerConfigKey }: PostPublicOauthOutboundAuthorization['Params'] = paramsVal.data;
    const queryString: PostPublicOauthOutboundAuthorization['Querystring'] = queryStringVal.data;
    const connectionConfig = queryString.params ? getConnectionConfig(queryString.params) : {};
    let connectionId = queryString.connection_id || connectionService.generateConnectionId();
    const hmac = 'hmac' in queryString ? queryString.hmac : undefined;
    const isConnectSession = res.locals['authType'] === 'connectSession';

    if (isConnectSession && queryString.connection_id) {
        errorRestrictConnectionId(res);
        return;
    }

    let logCtx: LogContext | undefined;

    try {
        logCtx =
            isConnectSession && connectSession.operationId
                ? logContextGetter.get({ id: connectSession.operationId, accountId: account.id })
                : await logContextGetter.create(
                      {
                          operation: { type: 'auth', action: 'create_connection' },
                          meta: { authType: 'oauth2-outbound', connectSession: endUserToMeta(res.locals.endUser) },
                          expiresAt: defaultOperationExpiration.auth()
                      },
                      { account, environment }
                  );

        if (!isConnectSession) {
            const checked = await hmacCheck({ environment, logCtx, providerConfigKey, connectionId, hmac, res });
            if (!checked) {
                return;
            }
        }

        const config = await configService.getProviderConfig(providerConfigKey, environment.id);
        if (!config) {
            void logCtx.error('Unknown provider config');
            await logCtx.failed();
            res.status(404).send({ error: { code: 'unknown_provider_config' } });
            return;
        }

        const provider = getProvider(config.provider);
        if (!provider) {
            void logCtx.error('Unknown provider');
            await logCtx.failed();
            res.status(404).send({ error: { code: 'unknown_provider_template' } });
            return;
        }

        if (provider.auth_mode !== 'OAUTH2') {
            void logCtx.error('Provider does not support OAuth2 Outbound Installation creation', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
            return;
        }

        if (isConnectSession && connectSession.connectionId) {
            const connection = await connectionService.getConnectionById(connectSession.connectionId);
            if (!connection) {
                void logCtx.error('Invalid connection');
                await logCtx.failed();
                res.status(400).send({ error: { code: 'invalid_connection' } });
                return;
            }
            connectionId = connection.connection_id;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const updatedConnectionConfig: ConnectionConfig = {
            ...connectionConfig,
            pending: true,
            pendingLog: logCtx.id
        };

        const [updatedConnection] = await connectionService.upsertConnection({
            connectionId,
            providerConfigKey,
            parsedRawCredentials: { type: 'OAUTH2' } as any,
            connectionConfig: updatedConnectionConfig,
            environmentId: environment.id
        });

        if (!updatedConnection) {
            void logCtx.error('Failed to create connection');
            await logCtx.failed();
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create connection' } });
            return;
        }

        const customValidationResponse = await validateConnection({
            connection: updatedConnection.connection,
            config,
            environment,
            account,
            logContextGetter
        });

        if (customValidationResponse.isErr()) {
            void logCtx.error('Connection failed custom validation', { error: customValidationResponse.error });
            await logCtx.failed();

            // since this is an invalid connection, delete it with no trace of it
            await connectionService.hardDelete(updatedConnection.connection.id);

            res.status(400).send({
                error: {
                    code: 'connection_validation_failed',
                    message: customValidationResponse.error.message
                }
            });
            return;
        }

        if (isConnectSession) {
            await linkConnection(db.knex, {
                endUserId: connectSession.endUserId,
                connection: updatedConnection.connection
            });
        }

        await logCtx.enrichOperation({
            connectionId: updatedConnection.connection.id,
            connectionName: updatedConnection.connection.connection_id
        });

        void logCtx.info('OAuth2 Outbound Installation creation was successful');
        await logCtx.success();

        void connectionCreatedHook(
            {
                connection: updatedConnection.connection,
                environment,
                account,
                auth_mode: 'OAUTH2',
                operation: updatedConnection.operation,
                endUser: isConnectSession ? res.locals['endUser'] : undefined
            },
            account,
            config,
            logContextGetter
        );

        metrics.increment(metrics.Types.AUTH_SUCCESS, 1, { auth_mode: provider.auth_mode });

        res.status(200).send({ connectionId, providerConfigKey });
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });

        if (logCtx) {
            void connectionCreationFailedHook(
                {
                    connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                    environment,
                    account,
                    auth_mode: 'OAUTH2',
                    error: {
                        type: 'unknown',
                        description: `Error during OAuth2 outbound install: ${prettyError}`
                    },
                    operation: 'unknown'
                },
                account
            );

            void logCtx.error('Error during OAuth2 Outbound Installation credentials creation', { error: err });
            await logCtx.failed();
        }

        errorManager.report(err, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.AUTH,
            environmentId: environment.id,
            metadata: { providerConfigKey, connectionId }
        });

        metrics.increment(metrics.Types.AUTH_FAILURE, 1, { auth_mode: 'OAUTH2' });

        next(err);
    }
});
