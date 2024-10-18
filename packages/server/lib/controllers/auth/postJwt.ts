import type { NextFunction } from 'express';
import tracer from 'dd-trace';
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
    getProvider
} from '@nangohq/shared';
import type { PostPublicJwtAuthorization, ProviderJwt } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import {
    connectionCreated as connectionCreatedHook,
    connectionCreationFailed as connectionCreationFailedHook,
    connectionTest as connectionTestHook
} from '../../hooks/hooks.js';
import { connectSessionTokenSchema, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';

const bodyValidation = z
    .object({
        api_key: z.string().optional(),
        privateKeyId: z.string().optional(),
        issuerId: z.string().optional(),
        privateKey: z.string().optional()
    })
    .strict();

const queryStringValidation = z
    .object({
        connection_id: connectionIdSchema.optional(),
        params: z.record(z.any()).optional(),
        public_key: z.string().uuid().optional(),
        connect_session_token: connectSessionTokenSchema.optional(),
        user_scope: z.string().optional(),
        hmac: z.string().optional()
    })
    .strict();

const paramValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicJwtAuthorization = asyncWrapper<PostPublicJwtAuthorization>(async (req, res, next: NextFunction) => {
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
    const { api_key = '', privateKeyId = '', issuerId = '', privateKey = '' } = val.data as PostPublicJwtAuthorization['Body'];
    const { connection_id: receivedConnectionId, params, hmac }: PostPublicJwtAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicJwtAuthorization['Params'] = paramVal.data;
    const connectionConfig = params ? getConnectionConfig(params) : {};

    let logCtx: LogContext | undefined;

    try {
        logCtx = await logContextGetter.create(
            {
                operation: { type: 'auth', action: 'create_connection' },
                meta: { authType: 'jwt' },
                expiresAt: defaultOperationExpiration.auth()
            },
            { account, environment }
        );
        void analytics.track(AnalyticsTypes.PRE_JWT_AUTH, account.id);

        await hmacCheck({
            environment,
            logCtx,
            providerConfigKey,
            connectionId: receivedConnectionId,
            hmac,
            res
        });

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

        if (provider.auth_mode !== 'JWT') {
            await logCtx.error('Provider does not support JWT auth', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const {
            success,
            error,
            response: credentials
        } = connectionService.getJwtCredentials(provider as ProviderJwt, privateKeyId, privateKey, issuerId, api_key);

        if (!success || !credentials) {
            await logCtx.error('Error during JWT creation', { error, provider: config.provider });
            await logCtx.failed();

            errorManager.errRes(res, 'jwt_error');

            return;
        }

        await logCtx.info('JWT connection creation was successful');
        await logCtx.success();

        const connectionId = receivedConnectionId || connectionService.generateConnectionId();

        const connectionResponse = await connectionTestHook(
            config.provider,
            provider,
            credentials,
            connectionId,
            providerConfigKey,
            environment.id,
            connectionConfig,
            tracer
        );

        if (connectionResponse.isErr()) {
            await logCtx.error('Provided credentials are invalid', { provider: config.provider });
            await logCtx.failed();

            errorManager.errResFromNangoErr(res, connectionResponse.error);

            return;
        }

        await logCtx.info('JWT connection creation was successful');
        await logCtx.success();

        const [updatedConnection] = await connectionService.upsertJWTConnection({
            connectionId,
            providerConfigKey,
            credentials,
            connectionConfig,
            metadata: {},
            config,
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
                    auth_mode: 'JWT',
                    operation: updatedConnection.operation
                },
                config.provider,
                logContextGetter,
                undefined,
                logCtx
            );
        }

        res.status(200).send({ providerConfigKey, connectionId });
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });

        void connectionCreationFailedHook(
            {
                connection: { connection_id: receivedConnectionId!, provider_config_key: providerConfigKey },
                environment,
                account,
                auth_mode: 'JWT',
                error: {
                    type: 'unknown',
                    description: `Error during JWT create: ${prettyError}`
                },
                operation: 'unknown'
            },
            'unknown',
            logCtx
        );
        if (logCtx) {
            await logCtx.error('Error during JWT credentials creation', { error: err });
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
});
