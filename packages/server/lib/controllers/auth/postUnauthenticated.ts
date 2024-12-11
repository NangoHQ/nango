import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { requireEmptyBody, stringifyError, zodErrorToHTTP } from '@nangohq/utils';

import { connectionCredential, connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import type { PostPublicUnauthenticatedAuthorization } from '@nangohq/types';
import { AnalyticsTypes, analytics, configService, connectionService, errorManager, getProvider, linkConnection } from '@nangohq/shared';
import { logContextGetter } from '@nangohq/logs';
import type { LogContext } from '@nangohq/logs';
import { hmacCheck } from '../../utils/hmac.js';
import { connectionCreated, connectionCreationFailed } from '../../hooks/hooks.js';
import db from '@nangohq/database';
import { isIntegrationAllowed } from '../../utils/auth.js';

const queryStringValidation = z
    .object({
        connection_id: connectionIdSchema.optional(),
        params: z.record(z.any()).optional()
    })
    .and(connectionCredential);

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
    const queryString: PostPublicUnauthenticatedAuthorization['Querystring'] = queryStringVal.data;
    const { providerConfigKey }: PostPublicUnauthenticatedAuthorization['Params'] = paramVal.data;
    let connectionId = queryString.connection_id || connectionService.generateConnectionId();
    const hmac = 'hmac' in queryString ? queryString.hmac : undefined;
    const isConnectSession = res.locals['authType'] === 'connectSession';

    // if (isConnectSession && queryString.connection_id) {
    //     errorRestrictConnectionId(res);
    //     return;
    // }

    let logCtx: LogContext | undefined;

    try {
        const logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'create_connection' }, meta: { authType: 'unauth' } },
            { account, environment }
        );
        void analytics.track(AnalyticsTypes.PRE_UNAUTH, account.id);

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

        if (provider.auth_mode !== 'NONE') {
            await logCtx.error('Provider does not support Unauthenticated', { provider: config.provider });
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

        const [updatedConnection] = await connectionService.upsertUnauthConnection({
            connectionId,
            providerConfigKey,
            provider: config.provider,
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
        await logCtx.info('Unauthenticated connection creation was successful');
        await logCtx.success();

        void connectionCreated(
            {
                connection: updatedConnection.connection,
                environment,
                account,
                auth_mode: 'NONE',
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
