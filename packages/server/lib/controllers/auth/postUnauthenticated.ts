import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyBody, stringifyError, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import type { PostPublicUnauthenticatedAuthorization } from '@nangohq/types';
import { AnalyticsTypes, analytics, configService, connectionService, errorManager, getProvider } from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';
import type { LogContext } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import { connectionCreated, connectionCreationFailed } from '../../hooks/hooks.js';

const queryStringValidation = z
    .object({
        connection_id: connectionIdSchema,
        public_key: z.string().uuid(),
        user_scope: z.string().optional(),
        hmac: z.string().optional()
    })
    .strict();

const paramValidation = z
    .object({
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

export const postPublicUnauthenticated = asyncWrapper<PostPublicUnauthenticatedAuthorization>(async (req, res) => {
    const valBody = requireEmptyBody(req);
    if (valBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const queryStringVal = queryStringValidation.safeParse(req.query);
    if (!queryStringVal.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringVal.error) } });
        return;
    }

    const paramVal = paramValidation.safeParse(req.params);
    if (!paramVal.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramVal.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const { connection_id: connectionId, hmac }: PostPublicUnauthenticatedAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicUnauthenticatedAuthorization['Params'] = paramVal.data;

    let logCtx: LogContext | undefined;

    try {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'create_connection' }, meta: { authType: 'unauth' } },
            { account, environment }
        );
        void analytics.track(AnalyticsTypes.PRE_UNAUTH, account.id);

        await hmacCheck({ environment, logCtx, providerConfigKey, connectionId, hmac, res });

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

        if (provider.auth_mode !== 'NONE') {
            await logCtx.error('Provider does not support Unauthenticated', { provider: config.provider });
            await logCtx.failed();
            res.status(400).send({ error: { code: 'invalid_auth_mode' } });
            return;
        }

        await logCtx.enrichOperation({ integrationId: config.id!, integrationName: config.unique_key, providerName: config.provider });

        const [updatedConnection] = await connectionService.upsertUnauthConnection({
            connectionId,
            providerConfigKey,
            provider: config.provider,
            environment,
            account
        });

        await logCtx.info('Unauthenticated connection creation was successful');
        await logCtx.success();

        if (updatedConnection) {
            await logCtx.enrichOperation({ connectionId: updatedConnection.connection.id!, connectionName: updatedConnection.connection.connection_id });
            void connectionCreated(
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

        res.status(200).send({ providerConfigKey, connectionId });
    } catch (err) {
        const prettyError = stringifyError(err, { pretty: true });

        void connectionCreationFailed(
            {
                connection: { connection_id: connectionId, provider_config_key: providerConfigKey },
                environment,
                account,
                auth_mode: 'NONE',
                error: { type: 'unknown', description: `Error during Unauth create: ${prettyError}` },
                operation: 'unknown'
            },
            'unknown',
            logCtx
        );
        if (logCtx) {
            await logCtx.error('Error during Unauthenticated connection creation', { error: err });
            await logCtx.failed();
        }

        errorManager.handleGenericError(err, req, res);
    }
});
