import * as z from 'zod';

import db from '@nangohq/database';
import { defaultOperationExpiration, endUserToMeta, logContextGetter } from '@nangohq/logs';
import {
    ErrorSourceEnum,
    LogActionEnum,
    appleAppStoreClient,
    configService,
    connectionService,
    errorManager,
    getProvider,
    syncEndUserToConnection
} from '@nangohq/shared';
import { metrics, report, stringifyError, zodErrorToHTTP } from '@nangohq/utils';

import { connectionCredential, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { validateConnection } from '../../hooks/connection/on/validate-connection.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../../hooks/hooks.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { errorRestrictConnectionId, isIntegrationAllowed } from '../../utils/auth.js';
import { hmacCheck } from '../../utils/hmac.js';

import type { LogContext } from '@nangohq/logs';
import type { ConnectionConfig, PostPublicAppStoreAuthorization, ProviderAppleAppStore } from '@nangohq/types';
import type { NextFunction } from 'express';

const bodyValidation = z
    .object({
        privateKeyId: z.string().min(1),
        privateKey: z.string().min(1),
        issuerId: z.string().min(1),
        scope: z.string().optional()
    })
    .strict();

const queryStringValidation = z
    .object({
        connection_id: connectionIdSchema.optional(),
        params: z.record(z.string(), z.any()).optional()
    })
    .and(connectionCredential);

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicAppStoreAuthorization = asyncWrapper<PostPublicAppStoreAuthorization>(async (req, res, next: NextFunction) => {
    const val = bodyValidation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const queryStringVal = queryStringValidation.safeParse(req.query);
    if (!queryStringVal.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringVal.error) }
        });
        return;
    }

    const paramsVal = paramsValidation.safeParse(req.params);
    if (!paramsVal.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramsVal.error) }
        });
        return;
    }

    const { account, environment, connectSession } = res.locals;
    const { issuerId, privateKey, privateKeyId, scope }: PostPublicAppStoreAuthorization['Body'] = val.data;
    const queryString: PostPublicAppStoreAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicAppStoreAuthorization['Params'] = paramsVal.data;
    // const connectionConfig = queryString.params ? getConnectionConfig(queryString.params) : {};
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
                          meta: { authType: 'appstore', connectSession: endUserToMeta(res.locals.endUser) },
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

        if (provider.auth_mode !== 'APP_STORE') {
            void logCtx.error('Provider does not support App Store auth', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
            return;
        }

        // Reconnect mechanism
        if (isConnectSession && connectSession.connectionId) {
            const connection = await connectionService.getConnectionById(connectSession.connectionId);
            if (!connection) {
                void logCtx.error('Invalid connection');
                await logCtx.failed();
                res.status(400).send({ error: { code: 'invalid_connection' } });
                return;
            }
            connectionId = connection?.connection_id;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const connectionConfig: ConnectionConfig = {
            privateKeyId,
            issuerId,
            scope
        };

        const credentialsRes = await appleAppStoreClient.createCredentials({
            provider: provider as ProviderAppleAppStore,
            connectionConfig,
            private_key: privateKey
        });
        if (credentialsRes.isErr()) {
            report(credentialsRes.error);
            void logCtx.error('Error during App store credentials creation', { error: credentialsRes.error });
            await logCtx.failed();
            return;
        }

        const [updatedConnection] = await connectionService.upsertConnection({
            connectionId,
            providerConfigKey,
            parsedRawCredentials: credentialsRes.value,
            connectionConfig,
            environmentId: environment.id
        });
        if (!updatedConnection) {
            res.status(500).send({ error: { code: 'server_error', message: 'failed to create connection' } });
            void logCtx.error('Failed to create connection');
            await logCtx.failed();
            return;
        }

        const customValidationResponse = await validateConnection({
            connection: updatedConnection.connection,
            config,
            account,
            logCtx
        });

        if (customValidationResponse.isErr()) {
            void logCtx.error('Connection failed custom validation', { error: customValidationResponse.error });
            await logCtx.failed();

            if (updatedConnection.operation === 'creation') {
                // since this is a new invalid connection, delete it with no trace of it
                await connectionService.hardDelete(updatedConnection.connection.id);
            }

            res.status(400).send({
                error: {
                    code: 'connection_validation_failed',
                    message: customValidationResponse.error.message
                }
            });
            return;
        }

        if (isConnectSession) {
            await syncEndUserToConnection(db.knex, { connectSession, connection: updatedConnection.connection, account, environment });
        }

        await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id, connectionName: updatedConnection.connection.connection_id });
        void logCtx.info('App Store auth creation was successful');
        await logCtx.success();

        void connectionCreatedHook(
            {
                connection: updatedConnection.connection,
                environment,
                account,
                auth_mode: 'APP_STORE',
                operation: updatedConnection.operation,
                endUser: res.locals.endUser
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
                    auth_mode: 'APP_STORE',
                    error: {
                        type: 'unknown',
                        description: `Error during App Store auth: ${prettyError}`
                    },
                    operation: 'unknown'
                },
                account
            );
            void logCtx.error('Error during App Store auth', { error: err });
            await logCtx.failed();
        }

        errorManager.report(err, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.AUTH,
            environmentId: environment.id,
            metadata: { providerConfigKey, connectionId }
        });

        metrics.increment(metrics.Types.AUTH_FAILURE, 1, { auth_mode: 'APP_STORE' });

        next(err);
    }
});
