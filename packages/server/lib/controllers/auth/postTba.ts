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
import {
    connectionCreated as connectionCreatedHook,
    connectionCreationFailed as connectionCreationFailedHook,
    testConnectionCredentials
} from '../../hooks/hooks.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { errorRestrictConnectionId, isIntegrationAllowed } from '../../utils/auth.js';
import { hmacCheck } from '../../utils/hmac.js';

import type { LogContext } from '@nangohq/logs';
import type { PostPublicTbaAuthorization, TbaCredentials } from '@nangohq/types';

const bodyValidation = z
    .object({
        token_id: z.string().min(1),
        token_secret: z.string().min(1),
        oauth_client_id_override: z.string().optional(),
        oauth_client_secret_override: z.string().optional()
    })
    .strict();

const queryStringValidation = z
    .object({
        connection_id: connectionIdSchema.optional(),
        params: z.record(z.string(), z.any()).optional(),
        user_scope: z.string().optional()
    })
    .and(connectionCredential);

const paramValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicTbaAuthorization = asyncWrapper<PostPublicTbaAuthorization>(async (req, res, next) => {
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

    const paramVal = paramValidation.safeParse(req.params);
    if (!paramVal.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramVal.error) }
        });
        return;
    }

    const { account, environment, connectSession } = res.locals;

    const body: PostPublicTbaAuthorization['Body'] = val.data;
    const { token_id: tokenId, token_secret: tokenSecret, oauth_client_id_override, oauth_client_secret_override } = body;
    const queryString: PostPublicTbaAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicTbaAuthorization['Params'] = paramVal.data;
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
                          meta: { authType: 'tba', connectSession: endUserToMeta(res.locals.endUser) },
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

        if (provider.auth_mode !== 'TBA') {
            void logCtx.error('Provider does not support TBA auth', { provider: config.provider });
            await logCtx.failed();

            res.status(400).send({
                error: { code: 'invalid_auth_mode' }
            });

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

        const tbaCredentials: TbaCredentials = {
            type: 'TBA',
            token_id: tokenId,
            token_secret: tokenSecret,
            config_override: {}
        };

        if (oauth_client_id_override || oauth_client_secret_override) {
            const obfuscatedClientSecret = oauth_client_secret_override ? oauth_client_secret_override.slice(0, 4) + '***' : '';

            void logCtx.info('Credentials override', {
                oauth_client_id: oauth_client_id_override || '',
                oauth_client_secret: obfuscatedClientSecret
            });

            if (oauth_client_id_override) {
                tbaCredentials.config_override['client_id'] = oauth_client_id_override;
            }

            if (oauth_client_secret_override) {
                tbaCredentials.config_override['client_secret'] = oauth_client_secret_override;
            }
        }

        const connectionResponse = await testConnectionCredentials({ config, connectionConfig, connectionId, credentials: tbaCredentials, provider, logCtx });
        if (connectionResponse.isErr()) {
            void logCtx.error('Provided credentials are invalid');
            await logCtx.failed();

            res.send({
                error: { code: 'invalid_credentials', message: 'The provided credentials did not succeed in a test API call' }
            });

            return;
        }

        const [updatedConnection] = await connectionService.upsertAuthConnection({
            connectionId,
            providerConfigKey,
            credentials: tbaCredentials,
            connectionConfig: {
                ...connectionConfig,
                oauth_client_id: config.oauth_client_id,
                oauth_client_secret: config.oauth_client_secret
            },
            metadata: {},
            config,
            environment
        });
        if (!updatedConnection) {
            res.status(500).send({ error: { code: 'server_error', message: 'failed to create connection' } });
            void logCtx.error('Failed to create connection');
            await logCtx.failed();
            return;
        }

        if (isConnectSession) {
            await linkConnection(db.knex, { endUserId: connectSession.endUserId, connection: updatedConnection.connection });
        }

        await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id, connectionName: updatedConnection.connection.connection_id });
        void logCtx.info('Tba connection creation was successful');
        await logCtx.success();

        void connectionCreatedHook(
            {
                connection: updatedConnection.connection,
                environment,
                account,
                auth_mode: 'TBA',
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

        void connectionCreationFailedHook(
            {
                connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                environment,
                account,
                auth_mode: 'TBA',
                error: {
                    type: 'unknown',
                    description: `Error during Unauth create: ${prettyError}`
                },
                operation: 'unknown'
            },
            account
        );
        if (logCtx) {
            void logCtx.error('Error during TBA credentials creation', { error: err });
            await logCtx.failed();
        }

        errorManager.report(err, {
            source: ErrorSourceEnum.PLATFORM,
            operation: LogActionEnum.AUTH,
            environmentId: environment.id,
            metadata: { providerConfigKey, connectionId }
        });

        metrics.increment(metrics.Types.AUTH_FAILURE, 1, { auth_mode: 'TBA' });

        next(err);
    }
});
