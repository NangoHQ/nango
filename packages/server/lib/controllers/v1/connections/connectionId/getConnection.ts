import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';
import type { GetConnection } from '@nangohq/types';
import { connectionService, configService, errorNotificationService } from '@nangohq/shared';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../../../../hooks/hooks.js';
import { logContextGetter } from '@nangohq/logs';
import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { endUserToApi } from '../../../../formatters/endUser.js';

const queryStringValidation = z
    .object({
        provider_config_key: providerConfigKeySchema,
        force_refresh: z.union([z.literal('true'), z.literal('false')]).optional(),
        env: envSchema
    })
    .strict();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

export const getConnection = asyncWrapper<GetConnection>(async (req, res) => {
    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const queryParamValues = queryStringValidation.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) }
        });
        return;
    }

    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) }
        });
        return;
    }

    const { environment, account } = res.locals;

    const queryParams = queryParamValues.data;
    const params = paramValue.data;

    const { provider_config_key: providerConfigKey, force_refresh } = queryParams;
    const instantRefresh = force_refresh === 'true';
    const { connectionId } = params;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({
            error: {
                code: 'unknown_provider_config',
                message: 'Provider config not found for the given provider config key. Please make sure the provider config exists in the Nango dashboard.'
            }
        });
        return;
    }

    const connectionRes = await connectionService.getConnectionForPrivateApi({ connectionId, providerConfigKey, environmentId: environment.id });

    if (!connectionRes) {
        res.status(400).send({ error: { code: 'missing_connection', message: 'Failed to find connection' } });
        return;
    }

    let connection = connectionRes.connection;

    const credentialResponse = await connectionService.refreshOrTestCredentials({
        account,
        environment,
        connection,
        integration,
        logContextGetter,
        instantRefresh,
        onRefreshSuccess: connectionRefreshSuccessHook,
        onRefreshFailed: connectionRefreshFailedHook
    });
    if (credentialResponse.isErr()) {
        const errorLog = await errorNotificationService.auth.get(connection.id!);

        // When we failed to refresh we still return a 200 because the connection is used in the UI
        // Ultimately this could be a second endpoint so the UI displays faster and no confusion between error code
        res.status(200).send({ data: { errorLog, provider: integration.provider, connection, endUser: endUserToApi(connectionRes.end_user) } });

        return;
    }

    connection = credentialResponse.value;

    if (instantRefresh) {
        // If we force the refresh we also specifically log a success operation (we usually only log error)
        const logCtx = await logContextGetter.create(
            { operation: { type: 'auth', action: 'refresh_token' } },
            {
                account,
                environment,
                integration: { id: integration.id!, name: integration.unique_key, provider: integration.provider },
                connection: { id: connection.id!, name: connection.connection_id }
            }
        );
        await logCtx.info(`Token manual refresh fetch was successful for ${providerConfigKey} and connection ${connectionId} from the web UI`);
        await logCtx.success();
    }

    res.status(200).send({
        data: {
            provider: integration.provider,
            connection,
            endUser: endUserToApi(connectionRes.end_user),
            errorLog: null
        }
    });
});
