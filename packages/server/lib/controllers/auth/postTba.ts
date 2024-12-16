import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { stringifyError, zodErrorToHTTP } from '@nangohq/utils';
import {
    analytics,
    configService,
    AnalyticsTypes,
    getConnectionConfig,
    connectionService,
    getProvider,
    errorManager,
    ErrorSourceEnum,
    LogActionEnum,
    linkConnection
} from '@nangohq/shared';
import type { TbaCredentials, PostPublicTbaAuthorization, MessageRowInsert } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, flushLogsBuffer, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import {
    connectionCreated as connectionCreatedHook,
    connectionTest as connectionTestHook,
    connectionCreationFailed as connectionCreationFailedHook
} from '../../hooks/hooks.js';
import { connectionCredential, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import db from '@nangohq/database';
import { isIntegrationAllowed } from '../../utils/auth.js';

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
        params: z.record(z.any()).optional(),
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

    const { account, environment } = res.locals;

    const body: PostPublicTbaAuthorization['Body'] = val.data;
    const { token_id: tokenId, token_secret: tokenSecret, oauth_client_id_override, oauth_client_secret_override } = body;
    const queryString: PostPublicTbaAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicTbaAuthorization['Params'] = paramVal.data;
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
                meta: { authType: 'tba' },
                expiresAt: defaultOperationExpiration.auth()
            },
            { account, environment }
        );
        void analytics.track(AnalyticsTypes.PRE_TBA_AUTH, account.id);

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

        if (provider.auth_mode !== 'TBA') {
            await logCtx.error('Provider does not support TBA auth', { provider: config.provider });
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

        const tbaCredentials: TbaCredentials = {
            type: 'TBA',
            token_id: tokenId,
            token_secret: tokenSecret,
            config_override: {}
        };

        if (oauth_client_id_override || oauth_client_secret_override) {
            const obfuscatedClientSecret = oauth_client_secret_override ? oauth_client_secret_override.slice(0, 4) + '***' : '';

            await logCtx.info('Credentials override', {
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

        const connectionResponse = await connectionTestHook({ config, connectionConfig, connectionId, credentials: tbaCredentials, provider });
        if (connectionResponse.isErr()) {
            if ('logs' in connectionResponse.error.payload) {
                await flushLogsBuffer(connectionResponse.error.payload['logs'] as MessageRowInsert[], logCtx);
            }
            await logCtx.error('Provided credentials are invalid', { provider: config.provider });
            await logCtx.failed();

            res.send({
                error: { code: 'invalid_credentials', message: 'The provided credentials did not succeed in a test API call' }
            });

            return;
        }

        await flushLogsBuffer(connectionResponse.value.logs, logCtx);

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
        await logCtx.info('Tba connection creation was successful');
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
            config.provider,
            logContextGetter,
            undefined,
            logCtx
        );

        res.status(200).send({ providerConfigKey, connectionId });
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });

        void connectionCreationFailedHook(
            {
                connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                environment,
                account,
                auth_mode: 'TABLEAU',
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
            await logCtx.error('Error during Tableau credentials creation', { error: err });
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
