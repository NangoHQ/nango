import type { NextFunction } from 'express';
import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP, stringifyError } from '@nangohq/utils';
import {
    analytics,
    configService,
    AnalyticsTypes,
    getConnectionConfig,
    connectionService,
    errorManager,
    ErrorSourceEnum,
    LogActionEnum,
    getProvider,
    linkConnection
} from '@nangohq/shared';
import type { ApiKeyCredentials, MessageRowInsert, PostPublicApiKeyAuthorization } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, flushLogsBuffer, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook, connectionTest } from '../../hooks/hooks.js';
import { connectionCredential, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import db from '@nangohq/database';
import { isIntegrationAllowed } from '../../utils/auth.js';

const bodyValidation = z
    .object({
        apiKey: z.string().min(1)
    })
    .strict();

const queryStringValidation = z
    .object({
        connection_id: connectionIdSchema.optional(),
        params: z.record(z.any()).optional()
    })
    .and(connectionCredential);

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicApiKeyAuthorization = asyncWrapper<PostPublicApiKeyAuthorization>(async (req, res, next: NextFunction) => {
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

    const { account, environment } = res.locals;
    const { apiKey }: PostPublicApiKeyAuthorization['Body'] = val.data;
    const queryString: PostPublicApiKeyAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicApiKeyAuthorization['Params'] = paramsVal.data;
    const connectionConfig = queryString.params ? getConnectionConfig(queryString.params) : {};
    let connectionId = queryString.connection_id || connectionService.generateConnectionId();
    const hmac = 'hmac' in queryString ? queryString.hmac : undefined;
    const isConnectSession = res.locals['authType'] === 'connectSession';

    // if (isConnectSession && queryString.connection_id) {
    //     errorRestrictConnectionId(res);
    //     return;
    // }

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

        if (!isConnectSession) {
            const checked = await hmacCheck({ environment, logCtx, providerConfigKey, connectionId, hmac, res });
            if (!checked) {
                return;
            }
        }

        const config = await configService.getProviderConfig(providerConfigKey, environment.id);
        if (!config) {
            await logCtx.error('Unknown provider config');
            await logCtx.failed();
            res.status(404).send({ error: { code: 'unknown_provider_config' } });
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
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        if (!(await isIntegrationAllowed({ config, res, logCtx }))) {
            return;
        }

        // Reconnect mechanism
        if (isConnectSession && res.locals.connectSession.connectionId) {
            const connection = await connectionService.getConnectionById(res.locals.connectSession.connectionId);
            if (!connection) {
                await logCtx.error('Invalid connection');
                await logCtx.failed();
                res.status(400).send({ error: { code: 'invalid_connection' } });
                return;
            }
            connectionId = connection?.connection_id;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        // Tests credentials
        const credentials: ApiKeyCredentials = {
            type: 'API_KEY',
            apiKey
        };

        const connectionResponse = await connectionTest({ config, connectionConfig, connectionId, credentials, provider });
        if (connectionResponse.isErr()) {
            if ('logs' in connectionResponse.error.payload) {
                await flushLogsBuffer(connectionResponse.error.payload['logs'] as MessageRowInsert[], logCtx);
            }
            await logCtx.error('Provided credentials are invalid', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'connection_test_failed', message: connectionResponse.error.message } });
            return;
        }

        await flushLogsBuffer(connectionResponse.value.logs, logCtx);

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

        if (isConnectSession) {
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
                operation: updatedConnection.operation,
                endUser: isConnectSession ? res.locals['endUser'] : undefined
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
                    connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
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
            metadata: { providerConfigKey, connectionId }
        });

        next(err);
    }
});
