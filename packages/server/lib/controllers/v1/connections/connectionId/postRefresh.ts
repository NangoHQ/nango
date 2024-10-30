import { z } from 'zod';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';
import type { PostConnectionRefresh } from '@nangohq/types';
import { connectionService, configService, errorNotificationService } from '@nangohq/shared';
import { connectionRefreshFailed as connectionRefreshFailedHook, connectionRefreshSuccess as connectionRefreshSuccessHook } from '../../../../hooks/hooks.js';
import { logContextGetter } from '@nangohq/logs';
import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';

const queryStringValidation = z
    .object({
        provider_config_key: providerConfigKeySchema,
        env: envSchema
    })
    .strict();

const paramValidation = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

export const getConnectionRefresh = asyncWrapper<PostConnectionRefresh>(async (req, res) => {
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

    const { provider_config_key: providerConfigKey } = queryParams;
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

    const connectionRes = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
    if (connectionRes.error) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    let connection = connectionRes.response!;

    const credentialResponse = await connectionService.refreshOrTestCredentials({
        account,
        environment,
        connection,
        integration,
        logContextGetter,
        instantRefresh: true,
        onRefreshSuccess: connectionRefreshSuccessHook,
        onRefreshFailed: connectionRefreshFailedHook
    });
    if (credentialResponse.isErr()) {
        const errorLog = await errorNotificationService.auth.get(connection.id!);

        res.status(400).send({
            error: {
                code: 'failed_to_refresh',
                payload: errorLog
            }
        });

        return;
    }

    connection = credentialResponse.value;

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

    res.status(200).send({
        data: {
            success: true
        }
    });
});
