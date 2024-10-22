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
import type { PostPublicPerimeterAuthorization } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import { connectionCreated as connectionCreatedHook, connectionCreationFailed as connectionCreationFailedHook } from '../../hooks/hooks.js';
import { connectSessionTokenSchema, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';

const bodyValidation = z
    .object({
        api_key: z.string().min(1)
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

export const postPublicPerimeterAuthorization = asyncWrapper<PostPublicPerimeterAuthorization>(async (req, res, next: NextFunction) => {
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
    const { api_key: apiKey }: PostPublicPerimeterAuthorization['Body'] = val.data;
    const { connection_id: receivedConnectionId, params, hmac }: PostPublicPerimeterAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicPerimeterAuthorization['Params'] = paramsVal.data;
    const connectionConfig = params ? getConnectionConfig(params) : {};

    let logCtx: LogContext | undefined;

    try {
        logCtx = await logContextGetter.create(
            {
                operation: { type: 'auth', action: 'create_connection' },
                meta: { authType: 'Perimeter' },
                expiresAt: defaultOperationExpiration.auth()
            },
            { account, environment }
        );
        void analytics.track(AnalyticsTypes.PRE_PERIMETER_AUTH, account.id);

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

        if (provider.auth_mode !== 'PERIMETER') {
            await logCtx.error('Provider does not support PERIMETER auth', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const { success, error, response: credentials } = await connectionService.getPerimeterCredentials(provider, apiKey, connectionConfig);

        if (!success || !credentials) {
            await logCtx.error('Error during Perimeter credentials creation', { error, provider: config.provider });
            await logCtx.failed();

            errorManager.errRes(res, 'perimeter_error');

            return;
        }

        const connectionId = receivedConnectionId || connectionService.generateConnectionId();

        await logCtx.info('Perimeter connection creation was successful');
        await logCtx.success();

        const [updatedConnection] = await connectionService.upsertPerimeterConnection({
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
                    auth_mode: 'PERIMETER',
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
                auth_mode: 'PERIMETER',
                error: {
                    type: 'unknown',
                    description: `Error during Perimeter create: ${prettyError}`
                },
                operation: 'unknown'
            },
            'unknown',
            logCtx
        );
        if (logCtx) {
            await logCtx.error('Error during Perimeter credentials creation', { error: err });
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
