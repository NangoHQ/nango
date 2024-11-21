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
import type { PostPublicSignatureAuthorization, ProviderSignature } from '@nangohq/types';
import type { LogContext } from '@nangohq/logs';
import { defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import {
    connectionCreated as connectionCreatedHook,
    connectionCreationFailed as connectionCreationFailedHook,
    connectionTest as connectionTestHook
} from '../../hooks/hooks.js';
import { connectionCredential, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { linkConnection } from '../../services/endUser.service.js';
import db from '@nangohq/database';
import { checkIfIntegrationIsAllowed } from '../../utils/auth.js';

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
        user_scope: z.string().optional()
    })
    .and(connectionCredential);

const paramsValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicSignatureAuthorization = asyncWrapper<PostPublicSignatureAuthorization>(async (req, res, next: NextFunction) => {
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
    const { username, password }: PostPublicSignatureAuthorization['Body'] = val.data;
    const queryString: PostPublicSignatureAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicSignatureAuthorization['Params'] = paramsVal.data;
    const connectionConfig = queryString.params ? getConnectionConfig(queryString.params) : {};
    const connectionId = queryString.connection_id || connectionService.generateConnectionId();
    const hmac = 'hmac' in queryString ? queryString.hmac : undefined;

    let logCtx: LogContext | undefined;

    try {
        logCtx = await logContextGetter.create(
            {
                operation: { type: 'auth', action: 'create_connection' },
                meta: { authType: 'signature' },
                expiresAt: defaultOperationExpiration.auth()
            },
            { account, environment }
        );
        void analytics.track(AnalyticsTypes.PRE_SIGNATURE_AUTH, account.id);

        if (authType !== 'connectSession') {
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

        if (provider.auth_mode !== 'SIGNATURE') {
            await logCtx.error('Provider does not support SIGNATURE auth', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        if (!(await checkIfIntegrationIsAllowed({ config, res, logCtx }))) {
            return;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const { success, error, response: credentials } = connectionService.getSignatureCredentials(provider as ProviderSignature, username, password);

        if (!success || !credentials) {
            await logCtx.error('Error during Signature credentials creation', { error, provider: config.provider });
            await logCtx.failed();

            errorManager.errRes(res, 'signature_error');

            return;
        }

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

        if (authType === 'connectSession') {
            const session = res.locals.connectSession;
            await linkConnection(db.knex, { endUserId: session.endUserId, connection: updatedConnection.connection });
        }

        await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
        await logCtx.info('Signature connection creation was successful');
        await logCtx.success();

        void connectionCreatedHook(
            {
                connection: updatedConnection.connection,
                environment,
                account,
                auth_mode: 'SIGNATURE',
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
                connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                environment,
                account,
                auth_mode: 'SIGNATURE',
                error: {
                    type: 'unknown',
                    description: `Error during Signature create: ${prettyError}`
                },
                operation: 'unknown'
            },
            'unknown',
            logCtx
        );
        if (logCtx) {
            await logCtx.error('Error during Signature credentials creation', { error: err });
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
