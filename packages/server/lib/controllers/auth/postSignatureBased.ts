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
    getProvider
} from '@nangohq/shared';
import type { PostPublicSignatureBasedAuthorization, ProviderSignatureBased } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import {
    connectionCreated as connectionCreatedHook,
    connectionCreationFailed as connectionCreationFailedHook,
    connectionTest as connectionTestHook
} from '../../hooks/hooks.js';
import { connectSessionTokenSchema, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { linkConnection } from '../../services/endUser.service.js';
import db from '@nangohq/database';

const bodyValidation = z
    .object({
        username: z.string().min(1),
        password: z.string().min(1),
        type: z.string().min(1)
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

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicSignatureBasedAuthorization = asyncWrapper<PostPublicSignatureBasedAuthorization>(async (req, res, next: NextFunction) => {
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

    const { account, environment, authType } = res.locals;
    const { username, password }: PostPublicSignatureBasedAuthorization['Body'] = val.data;
    const { connection_id: receivedConnectionId, params, hmac }: PostPublicSignatureBasedAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicSignatureBasedAuthorization['Params'] = paramsVal.data;
    const connectionConfig = params ? getConnectionConfig(params) : {};

    let logCtx: LogContext | undefined;

    try {
        logCtx = await logContextGetter.create(
            {
                operation: { type: 'auth', action: 'create_connection' },
                meta: { authType: 'signaturebased' },
                expiresAt: defaultOperationExpiration.auth()
            },
            { account, environment }
        );
        void analytics.track(AnalyticsTypes.PRE_SIGNATURE_BASED_AUTH, account.id);

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

        if (provider.auth_mode !== 'SIGNATURE_BASED') {
            await logCtx.error('Provider does not support SIGNATURE_BASED auth', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const {
            success,
            error,
            response: credentials
        } = connectionService.getSignatureBasedCredentials(provider as ProviderSignatureBased, username, password);

        if (!success || !credentials) {
            await logCtx.error('Error during SignatureBased credentials creation', { error, provider: config.provider });
            await logCtx.failed();

            errorManager.errRes(res, 'signaturebased_error');

            return;
        }

        const connectionId = receivedConnectionId || connectionService.generateConnectionId();

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

        const [updatedConnection] = await connectionService.upsertSignatureBasedConnection({
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
        await logCtx.info('SignatureBased connection creation was successful');
        await logCtx.success();

        void connectionCreatedHook(
            {
                connection: updatedConnection.connection,
                environment,
                account,
                auth_mode: 'SIGNATURE_BASED',
                operation: updatedConnection.operation
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
                connection: { connection_id: receivedConnectionId!, provider_config_key: providerConfigKey },
                environment,
                account,
                auth_mode: 'SIGNATURE_BASED',
                error: {
                    type: 'unknown',
                    description: `Error during SignatureBased create: ${prettyError}`
                },
                operation: 'unknown'
            },
            'unknown',
            logCtx
        );
        if (logCtx) {
            await logCtx.error('Error during SignatureBased credentials creation', { error: err });
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
